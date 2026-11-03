import hashlib
from dataclasses import replace
from pathlib import Path

import pytest

from pipeline.sources import SOURCES, SourceError, ensure_pdf

SOURCE = SOURCES[2025]


def test_download_with_wrong_hash_is_refused_and_not_kept(tmp_path: Path) -> None:
    served = tmp_path / "served.pdf"
    served.write_bytes(b"not the statement")
    source = replace(SOURCE, url=served.as_uri())
    raw_dir = tmp_path / "raw"
    with pytest.raises(SourceError, match="expected 5dd1673c"):
        ensure_pdf(source, raw_dir)
    assert list(raw_dir.rglob("*")) == [raw_dir / "janm"]


def test_download_with_right_hash_is_kept(tmp_path: Path) -> None:
    served = tmp_path / "served.pdf"
    served.write_bytes(b"stand-in document")
    source = replace(SOURCE, url=served.as_uri(), sha256=hashlib.sha256(b"stand-in document").hexdigest())
    path = ensure_pdf(source, tmp_path / "raw")
    assert path == tmp_path / "raw" / "janm" / "2025.pdf"
    assert path.read_bytes() == b"stand-in document"


def test_existing_file_with_wrong_hash_is_refused(tmp_path: Path) -> None:
    existing = tmp_path / "janm" / "2025.pdf"
    existing.parent.mkdir()
    existing.write_bytes(b"tampered")
    with pytest.raises(SourceError, match="refusing to continue"):
        ensure_pdf(SOURCE, tmp_path)
    assert existing.read_bytes() == b"tampered"
