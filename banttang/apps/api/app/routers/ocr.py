"""영수증 OCR 라우터.

흐름:
1. 클라이언트가 Supabase Storage에 영수증 업로드
2. 이 라우터를 호출 → CLOVA OCR로 1차 인식
3. Claude로 금액/상호/날짜 합리성 판단 (2차 검증)
4. 검증 결과를 transactions 테이블에 기록 (service_role)
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()


class VerifyReceiptRequest(BaseModel):
    post_id: str = Field(..., description="모집글 ID")
    storage_path: str = Field(..., description="Supabase Storage 내 영수증 경로")
    expected_total: int = Field(..., ge=0, description="기대 결제 금액(원)")


class VerifyReceiptResponse(BaseModel):
    verified: bool
    detected_total: int | None
    confidence: float
    reason: str


@router.post("/verify-receipt", response_model=VerifyReceiptResponse)
async def verify_receipt(payload: VerifyReceiptRequest) -> VerifyReceiptResponse:
    # TODO: services/ocr.py + services/claude_review.py 구현 후 연결
    return VerifyReceiptResponse(
        verified=False,
        detected_total=None,
        confidence=0.0,
        reason="not_implemented",
    )
