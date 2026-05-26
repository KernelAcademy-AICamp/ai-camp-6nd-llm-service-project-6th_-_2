"""영수증 이미지를 Supabase Storage에 업로드.

버킷: receipts (private)
경로 규칙: {party_id}/{receipt_id}.{ext}
  - RLS 정책이 split_part(name, '/', 1)을 party_id로 보고 참여자 가시성을 판단한다.
"""
from __future__ import annotations

import mimetypes
from dataclasses import dataclass

from app.core.supabase_admin import get_admin_client

_BUCKET = "receipts"


@dataclass(slots=True)
class UploadResult:
    storage_path: str


def _ext_from_content_type(content_type: str) -> str:
    if content_type == "image/jpeg":
        return "jpg"
    guessed = mimetypes.guess_extension(content_type or "")
    return (guessed or ".bin").lstrip(".")


def upload_receipt(
    *,
    party_id: str,
    receipt_id: str,
    file_bytes: bytes,
    content_type: str,
) -> UploadResult:
    ext = _ext_from_content_type(content_type)
    path = f"{party_id}/{receipt_id}.{ext}"

    client = get_admin_client()
    client.storage.from_(_BUCKET).upload(
        path=path,
        file=file_bytes,
        file_options={
            "content-type": content_type or "application/octet-stream",
            "upsert": "true",
        },
    )
    return UploadResult(storage_path=path)
