"""네이버 CLOVA OCR 호출 서비스.

키가 설정되지 않은 경우(개발 환경)에는 mock 결과를 반환한다.
실제 호출은 multipart/form-data 형식이며, message 필드에 JSON 메타,
file 필드에 바이너리를 함께 보낸다.
"""
from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass

import httpx

from app.core.config import settings


@dataclass(slots=True)
class OcrResult:
    detected_total: int | None
    merchant: str | None
    raw_text: str
    is_mock: bool


_TOTAL_PATTERNS = (
    re.compile(r"(?:합\s*계|총\s*결제|결제\s*금액|TOTAL)[^0-9]{0,8}([0-9,]{3,})", re.IGNORECASE),
    re.compile(r"([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})\s*원"),
)


def _parse_total_from_text(text: str) -> int | None:
    for pat in _TOTAL_PATTERNS:
        m = pat.search(text)
        if m:
            digits = re.sub(r"[^0-9]", "", m.group(1))
            if digits:
                return int(digits)
    return None


async def run_clova_ocr(*, file_bytes: bytes, content_type: str) -> OcrResult:
    if not settings.clova_ocr_secret or not settings.clova_ocr_invoke_url:
        # 개발 mock: 실제 호출 없이 검증 파이프라인이 동작하도록 placeholder.
        return OcrResult(
            detected_total=None,
            merchant=None,
            raw_text="[mock] CLOVA OCR not configured",
            is_mock=True,
        )

    ext = "jpg"
    if "/" in content_type:
        ext = content_type.split("/", 1)[1].split(";", 1)[0] or "jpg"

    message = {
        "version": "V2",
        "requestId": str(uuid.uuid4()),
        "timestamp": 0,
        "images": [{"format": ext, "name": "receipt"}],
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.post(
            settings.clova_ocr_invoke_url,
            headers={"X-OCR-SECRET": settings.clova_ocr_secret},
            files={
                "message": (None, json.dumps(message), "application/json"),
                "file": ("receipt." + ext, file_bytes, content_type),
            },
        )
        res.raise_for_status()
        payload = res.json()

    # CLOVA V2 응답에서 fields의 inferText를 이어 붙여 raw_text 구성.
    raw_text_lines: list[str] = []
    for image in payload.get("images", []):
        for field in image.get("fields", []):
            txt = field.get("inferText", "")
            if txt:
                raw_text_lines.append(txt)
    raw_text = "\n".join(raw_text_lines)

    detected_total = _parse_total_from_text(raw_text)

    # 상호명 추정: 첫 2~3줄 중 가장 그럴듯한 줄을 사용 (보강 여지).
    merchant: str | None = None
    for line in raw_text_lines[:5]:
        stripped = line.strip()
        if 2 <= len(stripped) <= 30 and not re.search(r"\d{3,}", stripped):
            merchant = stripped
            break

    return OcrResult(
        detected_total=detected_total,
        merchant=merchant,
        raw_text=raw_text,
        is_mock=False,
    )
