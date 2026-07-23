"""Layer 1 smoke test: the echolingo_speech package imports and its subpackages exist."""

import importlib

import echolingo_speech

SUBPACKAGES = (
    "data",
    "alignment",
    "features",
    "models",
    "training",
    "evaluation",
    "bundles",
    "worker",
)


def test_package_has_version():
    assert echolingo_speech.__version__ == "0.0.1"


def test_all_subpackages_import():
    for name in SUBPACKAGES:
        module = importlib.import_module(f"echolingo_speech.{name}")
        assert module.__doc__, f"echolingo_speech.{name} is missing a docstring"
