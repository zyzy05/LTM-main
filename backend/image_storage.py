import os
from pathlib import Path
from typing import Callable

from fastapi import HTTPException

BACKEND_DIRECTORY = Path(__file__).resolve().parent
IMAGE_STORAGE_DIRECTORY = BACKEND_DIRECTORY / "uploads"
MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024
ImageSignature = Callable[[bytes], bool]
IMAGE_FORMATS: dict[str, tuple[str, ImageSignature]] = {
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/webp": (
        ".webp",
        lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP",
    ),
}


def resolve_image_path(storage_path: str) -> Path:
    image_path = (BACKEND_DIRECTORY / storage_path).resolve()
    if image_path.parent != IMAGE_STORAGE_DIRECTORY.resolve():
        raise HTTPException(status_code=500, detail="Đường dẫn hình ảnh không hợp lệ")
    return image_path


def detect_image_type(contents: bytes) -> str | None:
    for content_type, (_, matches_signature) in IMAGE_FORMATS.items():
        if matches_signature(contents):
            return content_type
    return None


def safe_image_filename(filename: str | None) -> str:
    sanitized = os.path.basename((filename or "image").replace("\\", "/"))[:255]
    return sanitized or "image"
