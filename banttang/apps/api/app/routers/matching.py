"""선착순 매칭 라우터.

정원이 한정된 모집글의 join 요청은 단순 INSERT가 아니라 Redis 분산 락으로
동시성 보호한다. RLS만으로는 race condition을 막을 수 없다.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class JoinRequest(BaseModel):
    post_id: str
    user_id: str


class JoinResponse(BaseModel):
    joined: bool
    position: int | None
    reason: str | None = None


@router.post("/join", response_model=JoinResponse)
async def join(payload: JoinRequest) -> JoinResponse:
    # TODO: services/matching.py — Redis SETNX 기반 락 + post_participants insert
    return JoinResponse(joined=False, position=None, reason="not_implemented")
