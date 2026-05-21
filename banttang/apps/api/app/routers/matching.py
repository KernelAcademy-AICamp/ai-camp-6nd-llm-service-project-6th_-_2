"""파티 참여 신청 라우터 (placeholder).

현재 매칭은 Supabase RLS + DB trigger로 처리한다:
  - party_participants INSERT는 클라이언트에서 직접 (RLS가 정원/마감 검증)
  - status='approved' 전이 시 trigger가 정원 충족을 체크해 parties.status='closed'로 마감
    + chat_rooms 생성 + 시스템 메시지를 발행한다.

향후 manual approval 흐름이나 더 복잡한 동시성 케이스가 필요해지면 여기에 추가한다.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class JoinRequest(BaseModel):
    party_id: str
    user_id: str


class JoinResponse(BaseModel):
    joined: bool
    position: int | None
    reason: str | None = None


@router.post("/join", response_model=JoinResponse)
async def join(payload: JoinRequest) -> JoinResponse:
    # 미구현. 현 단계에서는 클라이언트가 직접 party_participants에 INSERT한다.
    return JoinResponse(joined=False, position=None, reason="not_implemented")
