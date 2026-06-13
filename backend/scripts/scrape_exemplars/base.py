"""Base abstractions for Stimulus Exemplar scraping."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Iterable


@dataclass
class RawExemplar:
    """One raw passage extracted from a source before cleaning."""

    task_type: str       # "read_aloud" | "summarize_written_text"
    text: str
    source_url: str
    license: str
    raw_meta: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "task_type": self.task_type,
            "text": self.text,
            "source_url": self.source_url,
            "license": self.license,
            "raw_meta": self.raw_meta,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "RawExemplar":
        return cls(
            task_type=d["task_type"],
            text=d["text"],
            source_url=d["source_url"],
            license=d["license"],
            raw_meta=d.get("raw_meta", {}),
        )


class SourceAdapter(ABC):
    """Abstract base for all Stimulus Exemplar source scrapers."""

    @abstractmethod
    def fetch(self) -> Iterable[RawExemplar]:
        """Yield RawExemplar items from the source."""
        ...

    @property
    def name(self) -> str:
        """Machine-readable source identifier used as the output filename stem."""
        return type(self).__name__.lower().removesuffix("adapter")
