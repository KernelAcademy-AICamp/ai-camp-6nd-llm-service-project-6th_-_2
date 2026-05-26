"""영수증 OCR + Claude 검증 라우터.

흐름 (동기):
1. 클라이언트가 영수증 이미지를 multipart로 업로드
2. Bearer 토큰 검증 + 호스트 권한 확인
3. CLOVA OCR 실행
4. Claude로 합리성 검증
5. 통과 시:
   - Supabase Storage에 영수증 업로드
   - receipts 테이블 INSERT (final_* 컬럼 채움, 1인당 금액 계산)
   - 채팅방에 receipt_card 시스템 메시지 자동 발행
   - parties.status를 closed → in_progress 로 전이 (필요 시)
   - 응답: receipts row
6. 실패 시: 422 + 사유 (row 미생성)

receipts 테이블은 verified/rejected 상태 컬럼이 없다 — row가 존재하면 검증 완료.
실패는 4xx로 즉시 반환하므로 row가 만들어지지 않는다.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.core.auth import AuthedUser, CurrentUser, require_party_host
from app.core.supabase_admin import get_admin_client
from app.services.claude_receipt_verifier import verify_with_claude
from app.services.clova_ocr import run_clova_ocr
from app.services.receipt_storage import upload_receipt

router = APIRouter()

_ACCEPTED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
_MAX_BYTES = 8 * 1024 * 1024  # 8MB


@router.post("/verify-receipt")
async def verify_receipt(
    party_id: str = Form(...),
    total_amount: int = Form(..., ge=0),
    file: UploadFile = File(...),
    user: AuthedUser = CurrentUser,
) -> dict[str, Any]:
    if file.content_type not in _ACCEPTED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unsupported content type: {file.content_type}",
        )

    raw = await file.read()
    if len(raw) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="file too large (>8MB)",
        )

    require_party_host(party_id, user)

    client = get_admin_client()

    # 1) OCR + Claude 검증
    ocr = await run_clova_ocr(file_bytes=raw, content_type=file.content_type or "")
    verdict = await verify_with_claude(ocr=ocr, expected_total=total_amount)

    if not verdict.verified:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=verdict.reason or "영수증을 인증하지 못했어요.",
        )

    # 2) 승인 참여자 수로 1인당 금액 계산
    participants_res = (
        client.table("party_participants")
        .select("id", count="exact")
        .eq("party_id", party_id)
        .eq("status", "approved")
        .execute()
    )
    approved_count = participants_res.count or 0
    if approved_count <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="approved 참여자가 없어 1인당 금액을 계산할 수 없어요.",
        )
    price_per_person = round(total_amount / approved_count)

    # 3) Storage 업로드 (receipt id를 먼저 만들어 경로에 사용)
    receipt_id = str(uuid.uuid4())
    try:
        uploaded = upload_receipt(
            party_id=party_id,
            receipt_id=receipt_id,
            file_bytes=raw,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"storage upload failed: {exc}",
        ) from exc

    # 4) receipts INSERT
    now_iso = datetime.now(timezone.utc).isoformat()
    final_store_name = ocr.merchant or "미상"
    insert_payload = {
        "id": receipt_id,
        "party_id": party_id,
        "uploader_id": user.id,
        "storage_path": uploaded.storage_path,
        "ocr_store_name": ocr.merchant,
        "ocr_total_amount": ocr.detected_total,
        "ocr_confidence": verdict.confidence,
        "final_store_name": final_store_name,
        "final_total_amount": total_amount,
        "final_paid_at": now_iso,
        "price_per_person": price_per_person,
        "shared_to_chat_at": now_iso,
    }
    insert_res = client.table("receipts").insert(insert_payload).execute()
    if not insert_res.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="failed to insert receipt",
        )
    receipt_row = insert_res.data[0]

    # 5) parties.status: closed → in_progress (영수증이 올라온 시점부터 거래 진행)
    try:
        client.table("parties").update({"status": "in_progress"}).eq(
            "id", party_id
        ).eq("status", "closed").execute()
    except Exception:  # noqa: BLE001
        # 상태 전이 실패는 치명적이지 않음 — pg_cron이나 후속 호출에서 보정 가능
        pass

    # 6) 채팅방에 receipt_card 시스템 메시지 발행 (room_id를 알아내서)
    try:
        room_res = (
            client.table("chat_rooms")
            .select("id")
            .eq("party_id", party_id)
            .maybeSingle()
            .execute()
        )
        room_id = room_res.data.get("id") if room_res.data else None
        if room_id:
            client.table("chat_messages").insert(
                {
                    "room_id": room_id,
                    "sender_id": None,
                    "type": "receipt_card",
                    "system_event": "receipt_uploaded",
                    "content": f"{final_store_name} · {total_amount:,}원 영수증이 등록되었어요.",
                    "metadata": {
                        "receipt_id": receipt_id,
                        "amount": total_amount,
                    },
                }
            ).execute()
    except Exception:  # noqa: BLE001
        # 메시지 발행 실패도 비치명적
        pass

    return receipt_row
