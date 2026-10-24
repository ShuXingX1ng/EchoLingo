"""Low-rank adapters (LoRA) on the Wav2Vec2 transformer's attention projections.

`inject_lora` wraps the chosen `nn.Linear`s of every encoder layer in a
`LoRALinear`: the original weight stays frozen and a trainable low-rank update
`B @ A * (alpha / rank)` is added, with `B` zero-initialized so an injected
model starts out identical to the original. Works on a `Wav2Vec2Model` or on
the `.wav2vec2` of a `Wav2Vec2ForCTC` (anything with `encoder.layers[i]
.attention.<name>`), so the same adapter trains under CTC and is later merged
into the plain encoder that `features/cache.py` extracts layers from.

Adapter state is keyed `encoder.layers.<i>.attention.<name>.lora_{A,B}`, the
same in both models.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import torch
from torch import nn

ADAPTER_WEIGHTS_NAME = "adapter.safetensors"
ADAPTER_CONFIG_NAME = "adapter_config.json"


@dataclass(frozen=True)
class LoRAConfig:
    rank: int = 16
    alpha: float = 32.0
    dropout: float = 0.05
    target_modules: tuple[str, ...] = ("q_proj", "v_proj")


class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear, rank: int, alpha: float, dropout: float) -> None:
        super().__init__()
        self.base = base
        for parameter in self.base.parameters():
            parameter.requires_grad = False
        self.scaling = alpha / rank
        self.dropout = nn.Dropout(dropout)
        self.lora_A = nn.Parameter(torch.empty(rank, base.in_features))
        self.lora_B = nn.Parameter(torch.zeros(base.out_features, rank))
        nn.init.kaiming_uniform_(self.lora_A, a=5**0.5)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        update = self.dropout(x) @ self.lora_A.t() @ self.lora_B.t()
        return self.base(x) + update * self.scaling

    def merged(self) -> nn.Linear:
        """A plain `nn.Linear` with the update folded into its weight."""
        merged = nn.Linear(
            self.base.in_features, self.base.out_features, bias=self.base.bias is not None
        ).to(self.base.weight.device, self.base.weight.dtype)
        with torch.no_grad():
            delta = (self.lora_B @ self.lora_A) * self.scaling
            merged.weight.copy_(self.base.weight + delta.to(self.base.weight.dtype))
            if self.base.bias is not None:
                merged.bias.copy_(self.base.bias)
        return merged


def _encoder_layers(model: nn.Module):
    return model.encoder.layers


def inject_lora(model: nn.Module, config: LoRAConfig) -> list[str]:
    """Wrap `config.target_modules` of every encoder layer's attention and
    return the wrapped module names (`encoder.layers.<i>.attention.<name>`)."""
    names = []
    for index, layer in enumerate(_encoder_layers(model)):
        for name in config.target_modules:
            base = getattr(layer.attention, name)
            if isinstance(base, LoRALinear):
                raise ValueError(f"encoder.layers.{index}.attention.{name} already has LoRA")
            if not isinstance(base, nn.Linear):
                raise TypeError(f"encoder.layers.{index}.attention.{name} is not nn.Linear")
            wrapped = LoRALinear(base, config.rank, config.alpha, config.dropout)
            # A new module starts in train mode; follow the model's mode so
            # the LoRA dropout is off in a model that is already in eval.
            wrapped.train(base.training)
            setattr(layer.attention, name, wrapped.to(base.weight.device))
            names.append(f"encoder.layers.{index}.attention.{name}")
    return names


def lora_modules(model: nn.Module) -> dict[str, LoRALinear]:
    found = {}
    for index, layer in enumerate(_encoder_layers(model)):
        for name, module in layer.attention.named_children():
            if isinstance(module, LoRALinear):
                found[f"encoder.layers.{index}.attention.{name}"] = module
    return found


def lora_parameters(model: nn.Module) -> list[nn.Parameter]:
    return [p for module in lora_modules(model).values() for p in (module.lora_A, module.lora_B)]


def lora_state_dict(model: nn.Module) -> dict[str, torch.Tensor]:
    state = {}
    for prefix, module in lora_modules(model).items():
        state[f"{prefix}.lora_A"] = module.lora_A.detach().cpu().contiguous()
        state[f"{prefix}.lora_B"] = module.lora_B.detach().cpu().contiguous()
    return state


def load_lora_state(model: nn.Module, state: dict[str, torch.Tensor]) -> None:
    modules = lora_modules(model)
    expected = {f"{p}.lora_{s}" for p in modules for s in ("A", "B")}
    if set(state) != expected:
        missing, unexpected = expected - set(state), set(state) - expected
        raise ValueError(f"adapter state mismatch: missing {sorted(missing)[:3]}, "
                         f"unexpected {sorted(unexpected)[:3]}")
    with torch.no_grad():
        for prefix, module in modules.items():
            module.lora_A.copy_(state[f"{prefix}.lora_A"])
            module.lora_B.copy_(state[f"{prefix}.lora_B"])


def merge_lora(model: nn.Module) -> int:
    """Replace every `LoRALinear` by its merged `nn.Linear`; returns how many."""
    count = 0
    for layer in _encoder_layers(model):
        for name, module in list(layer.attention.named_children()):
            if isinstance(module, LoRALinear):
                setattr(layer.attention, name, module.merged())
                count += 1
    return count


def save_adapter(model: nn.Module, config: LoRAConfig, directory: Path, metadata: dict) -> Path:
    from safetensors.torch import save_file

    directory.mkdir(parents=True, exist_ok=True)
    save_file(lora_state_dict(model), str(directory / ADAPTER_WEIGHTS_NAME))
    payload = {"lora": asdict(config), **metadata}
    (directory / ADAPTER_CONFIG_NAME).write_text(json.dumps(payload, indent=2) + "\n")
    return directory


def read_adapter_config(directory: Path) -> tuple[LoRAConfig, dict]:
    payload = json.loads((directory / ADAPTER_CONFIG_NAME).read_text())
    lora = payload.pop("lora")
    lora["target_modules"] = tuple(lora["target_modules"])
    return LoRAConfig(**lora), payload


def adapter_sha256(directory: Path) -> str:
    """SHA-256 of the saved adapter weights: identifies one trained adapter."""
    return hashlib.sha256((directory / ADAPTER_WEIGHTS_NAME).read_bytes()).hexdigest()


def apply_adapter(
    model: nn.Module,
    directory: Path,
    *,
    merge: bool = True,
    encoder_model_id: str | None = None,
    encoder_revision: str | None = None,
) -> dict:
    """Inject the adapter saved in `directory` into `model`, load its weights
    and (by default) merge them; returns the adapter's metadata. With
    `encoder_model_id` / `encoder_revision`, an adapter trained on another
    encoder is refused before `model` is touched."""
    from safetensors.torch import load_file

    config, metadata = read_adapter_config(directory)
    for key, expected in (("encoder_model_id", encoder_model_id),
                          ("encoder_revision", encoder_revision)):
        if expected is not None and metadata.get(key) != expected:
            raise ValueError(f"{directory} was trained on {key} {metadata.get(key)}, "
                             f"not {expected}")
    inject_lora(model, config)
    load_lora_state(model, load_file(str(directory / ADAPTER_WEIGHTS_NAME)))
    if merge:
        merge_lora(model)
    return metadata
