"""파티 라이프사이클 라우터.

호스트가 거래를 완료 처리하면 parties.status를 'completed'로 전이한다.
완료 조건: 최소 1건의 영수증(receipts row)이 존재해야 한다 — 영수증이 곧 정산 인증이므로.
추후 알림톡 발송, 신뢰점수 가산 등 부수 효과를 여기에 추가한다.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.core.auth import AuthedUser, CurrentUser, require_party_host
from app.core.supabase_admin import get_admin_client

router = APIRouter()


@router.post("/{party_id}/complete")
def complete_party(
    party_id: str,
    user: AuthedUser = CurrentUser,
) -> dict:
    require_party_host(party_id, user)

    client = get_admin_client()

    party_res = (
        client.table("parties")
        .select("id, status")
        .eq("id", party_id)
        .single()
        .execute()
    )
    if not party_res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="party not found")

    current = party_res.data.get("status")
    if current == "completed":
        full = client.table("parties").select("*").eq("id", party_id).single().execute()
        return full.data
    if current not in ("closed", "in_progress"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"cannot complete from status '{current}'",
        )

    # 영수증 등록 여부 확인 — receipts row가 존재해야 완료 가능
    rc_res = (
        client.table("receipts")
        .select("id", count="exact")
        .eq("party_id", party_id)
        .limit(1)
        .execute()
    )
    if not rc_res.count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="receipt not uploaded yet",
        )

    update_res = (
        client.table("parties")
        .update(
            {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", party_id)
        .execute()
    )
    if not update_res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="failed to update party status",
        )

    # TODO: 참여자에게 알림톡 발송, 신뢰점수 가산 — services/ 추가 후 연결
    return update_res.data[0]
