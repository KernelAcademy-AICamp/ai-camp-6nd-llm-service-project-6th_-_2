"""Claude로 영수증 OCR 결과의 합리성을 2차 검증.

검사 항목:
- detected_total 이 expected_total과 같은가? (오차 허용 ±1원)
- raw_text에 결제 일시·상호가 합리적으로 보이는가?
- 명백한 위·변조 신호가 보이는가? (반복 텍스트, 비합리적 금액 등)

ANTHROPIC_API_KEY가 없는 환경에서는 룰 기반 단순 비교로 폴백한다.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from anthropic import AsyncAnthropic

from app.core.config import settings
from app.services.clova_ocr import OcrResult


@dataclass(slots=True)
class VerificationVerdict:
    verified: bool
    reason: str
    detected_total: int | None
    confidence: float


_SYSTEM_PROMPT = """너는 한국 영수증 검증 보조 시스템이다.
사용자가 올린 영수증 OCR 결과와 사용자가 신고한 결제 금액이 일치하는지 판단한다.

다음을 확인:
1. OCR로 추출된 총 금액이 신고 금액과 일치하는가 (오차 1원 이내).
2. OCR 텍스트에 상호명, 결제 일시, 품목/금액 라인이 합리적으로 보이는가.
3. 명백한 변조·합성 흔적이 보이는가 (반복 텍스트, 형식 깨짐 등).

반드시 JSON으로만 답한다:
{
  "verified": boolean,
  "reason": "한국어 한 문장 사유",
  "detected_total": integer | null,
  "confidence": 0.0~1.0
}
"""


def _fallback(ocr: OcrResult, expected_total: int) -> VerificationVerdict:
    """API 키가 없거나 호출 실패 시 룰 기반 판정."""
    if ocr.detected_total is None:
        return VerificationVerdict(
            verified=False,
            reason="영수증에서 결제 금액을 인식하지 못했어요. 다시 또렷이 촬영해주세요.",
            detected_total=None,
            confidence=0.2,
        )
    if abs(ocr.detected_total - expected_total) <= 1:
        return VerificationVerdict(
            verified=True,
            reason="입력 금액과 영수증 금액이 일치해요.",
            detected_total=ocr.detected_total,
            confidence=0.6 if ocr.is_mock else 0.85,
        )
    return VerificationVerdict(
        verified=False,
        reason=f"입력 금액({expected_total}원)과 영수증 금액({ocr.detected_total}원)이 달라요.",
        detected_total=ocr.detected_total,
        confidence=0.5,
    )


async def verify_with_claude(
    *,
    ocr: OcrResult,
    expected_total: int,
) -> VerificationVerdict:
    if not settings.anthropic_api_key or ocr.is_mock:
        return _fallback(ocr, expected_total)

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    user_message = (
        f"신고 금액: {expected_total}원\n"
        f"OCR 추정 금액: {ocr.detected_total}\n"
        f"OCR 추정 상호: {ocr.merchant or '미상'}\n"
        f"OCR 원문:\n{ocr.raw_text[:3000]}"
    )

    try:
        msg = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=512,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
    except Exception:  # noqa: BLE001
        return _fallback(ocr, expected_total)

    text = "".join(
        block.text for block in msg.content if getattr(block, "type", "") == "text"
    ).strip()

    # JSON만 추출 (혹시 모를 코드펜스 처리)
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()

    try:
        parsed = json.loads(text)
        return VerificationVerdict(
            verified=bool(parsed.get("verified")),
            reason=str(parsed.get("reason") or "")[:500],
            detected_total=(
                int(parsed["detected_total"])
                if isinstance(parsed.get("detected_total"), (int, float))
                else None
            ),
            confidence=float(parsed.get("confidence") or 0.0),
        )
    except (json.JSONDecodeError, ValueError, TypeError):
        return _fallback(ocr, expected_total)
