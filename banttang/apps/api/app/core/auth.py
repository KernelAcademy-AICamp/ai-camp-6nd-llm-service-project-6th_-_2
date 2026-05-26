"""Supabase 액세스 토큰 검증 + 파티 참여 권한 확인 헬퍼.

Next.js는 사용자의 Supabase session.access_token을 Authorization 헤더로 보낸다.
FastAPI는 그 토큰을 GoTrue (auth.get_user) 로 검증한 뒤
secret 키 권한의 supabase_admin 클라이언트로 실제 작업을 수행한다.
"""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status

from app.core.supabase_admin import get_admin_client


class AuthedUser:
    def __init__(self, user_id: str, access_token: str) -> None:
        self.id = user_id
        self.access_token = access_token


def get_current_user(
    authorization: str | None = Header(default=None),
) -> AuthedUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )
    token = authorization.split(" ", 1)[1].strip()

    client = get_admin_client()
    try:
        # supabase-py의 auth.get_user(jwt)는 토큰을 GoTrue에 보내 검증한다.
        result = client.auth.get_user(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"invalid token: {exc}",
        ) from exc

    user = result.user if result else None
    if not user or not user.id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid user",
        )

    return AuthedUser(user_id=user.id, access_token=token)


def require_party_participant(party_id: str, user: AuthedUser) -> None:
    """파티 승인 참여자가 아닐 경우 403. (호스트도 row를 가지므로 포함됨)"""
    client = get_admin_client()
    res = (
        client.table("party_participants")
        .select("id")
        .eq("party_id", party_id)
        .eq("user_id", user.id)
        .eq("status", "approved")
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not a participant of this party",
        )


def require_party_host(party_id: str, user: AuthedUser) -> None:
    """호스트만 허용. UPDATE 류 작업에서 사용."""
    client = get_admin_client()
    res = (
        client.table("parties")
        .select("host_id")
        .eq("id", party_id)
        .single()
        .execute()
    )
    if not res.data or res.data.get("host_id") != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="host only",
        )


# FastAPI Depends 헬퍼
CurrentUser = Depends(get_current_user)
