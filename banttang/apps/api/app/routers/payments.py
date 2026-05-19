"""결제 PG 콜백 라우터.

플랫폼은 돈을 보관하지 않음 (CLAUDE.md §3).
이 엔드포인트는 토스페이먼츠/포트원 등에서 오는 콜백을 받아
거래 인증·히스토리 기록 용도로만 사용한다.
"""
from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


class TossCallbackAck(BaseModel):
    received: bool


@router.post("/toss/callback", response_model=TossCallbackAck)
async def toss_callback(request: Request) -> TossCallbackAck:
    # TODO: services/payments/toss.py 에서 서명 검증 후 처리
    _ = await request.body()
    return TossCallbackAck(received=True)
