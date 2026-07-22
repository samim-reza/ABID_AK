"""PDF storage for the invoice archive.

Files live on disk (never in the database) under ``settings.upload_dir``.
Uploads are streamed in chunks so a large PDF never sits in memory, capped at
``settings.max_upload_mb``, and losslessly re-compressed when pikepdf is
available — the smaller of (original, recompressed) is what gets kept.
"""

import hashlib
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from app.config import settings

logger = logging.getLogger("abidak.storage")

PDF_MAGIC = b"%PDF-"
CHUNK_SIZE = 1024 * 1024


class StorageError(ValueError):
    """Raised for a rejected upload; routers surface this as a 400."""


@dataclass(frozen=True)
class StoredPdf:
    stored_name: str
    size: int
    checksum: str


def invoices_dir() -> Path:
    path = Path(settings.upload_dir).expanduser() / "invoices"
    path.mkdir(parents=True, exist_ok=True)
    return path


def invoice_path(stored_name: str) -> Path:
    """Resolve a stored file, refusing anything that escapes the upload dir."""
    root = invoices_dir().resolve()
    path = (root / Path(stored_name).name).resolve()
    if path.parent != root:
        raise StorageError("Invalid file reference")
    return path


def _compress(path: Path) -> None:
    """Shrink a PDF in place, losslessly. Any failure leaves the original."""
    if not settings.compress_pdfs:
        return
    try:
        import pikepdf
    except ImportError:  # optional dependency — plain storage still works
        return

    tmp = path.with_name(f"{path.stem}.opt.pdf")
    try:
        with pikepdf.open(path) as pdf:
            pdf.save(
                tmp,
                compress_streams=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
                linearize=True,
            )
        if tmp.stat().st_size < path.stat().st_size:
            tmp.replace(path)
    except Exception:  # corrupt/encrypted PDFs simply stay as uploaded
        logger.warning("PDF compression skipped for %s", path.name, exc_info=True)
    finally:
        tmp.unlink(missing_ok=True)


def save_invoice_pdf(upload: UploadFile) -> StoredPdf:
    """Stream an uploaded PDF to disk and return its stored identity."""
    limit = settings.max_upload_mb * 1024 * 1024
    path = invoices_dir() / f"{uuid.uuid4().hex}.pdf"
    digest = hashlib.sha256()
    size = 0

    try:
        with path.open("wb") as fh:
            while chunk := upload.file.read(CHUNK_SIZE):
                if size == 0 and not chunk.startswith(PDF_MAGIC):
                    raise StorageError("Only PDF files can be uploaded")
                size += len(chunk)
                if size > limit:
                    raise StorageError(f"File is larger than {settings.max_upload_mb} MB")
                digest.update(chunk)
                fh.write(chunk)
        if size == 0:
            raise StorageError("The uploaded file is empty")
    except Exception:
        path.unlink(missing_ok=True)
        raise

    _compress(path)
    return StoredPdf(stored_name=path.name, size=path.stat().st_size, checksum=digest.hexdigest())


def delete_invoice_pdf(stored_name: str) -> None:
    """Best-effort removal — a missing file must never block a DB delete."""
    try:
        invoice_path(stored_name).unlink(missing_ok=True)
    except Exception:
        logger.warning("Could not delete stored PDF %s", stored_name, exc_info=True)
