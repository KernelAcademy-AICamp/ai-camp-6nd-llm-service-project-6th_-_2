import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PartyChatContainer } from "@/components/chat/party-chat-container";
import { closePartyIfFull } from "@/app/_actions/party-lifecycle";
import type {
  ChatMessageWithSender,
  PartyParticipantWithProfile,
  PartyWithStats,
  Receipt,
} from "@/lib/types/domain";

interface PageProps {
  params: { partyId: string };
}

// 채팅방 = 거래 메인 컨테이너 (영수증 인증·거래 완료 시트 포함).
// 모집 단계(recruiting)에서는 채팅방이 아직 없으므로 placeholder를 보여준다.
export default async function PartyPage({ params }: PageProps) {
  const { partyId } = params;
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/parties/${partyId}`);
  }

  // 0) 자동 복구: 정원이 찼는데 status가 recruiting이면 마감 + 채팅방 생성
  await closePartyIfFull(partyId);

  // 1) 파티 본문 (뷰로 호스트 닉네임·정원 통계 한 번에)
  const partyRes = await supabase
    .from("v_parties_with_stats")
    .select("*")
    .eq("id", partyId)
    .maybeSingle<PartyWithStats>();

  if (!partyRes.data) {
    notFound();
  }
  const party = partyRes.data;

  // 픽업 장소 이름 (info card 표시용)
  // - pickup_location_id가 있으면 마스터에서 가져옴
  // - 없으면 custom_pickup_name(호스트 직접 입력 또는 "장소 변경하기"로 저장된 값)을 사용
  const partyExt = party as PartyWithStats & {
    pickup_location_id?: string | null;
    custom_pickup_name?: string | null;
  };
  let pickupLocationName: string | null = null;
  if (partyExt.pickup_location_id) {
    const pickupRes = await supabase
      .from("pickup_locations")
      .select("name")
      .eq("id", partyExt.pickup_location_id)
      .maybeSingle<{ name: string }>();
    pickupLocationName = pickupRes.data?.name ?? null;
  } else if (partyExt.custom_pickup_name) {
    pickupLocationName = partyExt.custom_pickup_name;
  }

  // 2) 채팅방 (closed 이전엔 row가 없을 수 있음)
  const roomRes = await supabase
    .from("chat_rooms")
    .select("id, party_id, opened_at, closed_at")
    .eq("party_id", partyId)
    .maybeSingle<{ id: string; party_id: string; opened_at: string; closed_at: string | null }>();
  const chatRoom = roomRes.data;

  // 3) 참여자 (호스트 포함). approved + pending 모두 가져와서 호스트 승인 UI에서 분기.
  const participantsRes = await supabase
    .from("party_participants")
    .select(
      "id, party_id, user_id, status, is_host, applied_at, approved_at, profile:profiles!party_participants_user_id_fkey(id, nickname, level)",
    )
    .eq("party_id", partyId)
    .in("status", ["approved", "pending"]);
  const participantsAll = (participantsRes.data ?? []) as unknown as PartyParticipantWithProfile[];
  const participants = participantsAll.filter((p) => p.status === "approved");
  const pendingParticipants = participantsAll.filter((p) => p.status === "pending");

  // 4) 채팅 메시지 + 영수증 (room이 있을 때만)
  let initialMessages: ChatMessageWithSender[] = [];
  let initialReceipts: Receipt[] = [];
  if (chatRoom) {
    const [messagesRes, receiptsRes] = await Promise.all([
      supabase
        .from("chat_messages")
        .select(
          "id, room_id, sender_id, type, system_event, content, metadata, created_at, sender:profiles!chat_messages_sender_id_fkey(id, nickname)",
        )
        .eq("room_id", chatRoom.id)
        .order("created_at", { ascending: true })
        .limit(200),
      supabase
        .from("receipts")
        .select(
          "id, party_id, uploader_id, storage_path, ocr_store_name, ocr_total_amount, ocr_paid_at, ocr_confidence, final_store_name, final_total_amount, final_paid_at, price_per_person, shared_to_chat_at, created_at, updated_at",
        )
        .eq("party_id", partyId)
        .order("created_at", { ascending: true }),
    ]);

    initialMessages = (messagesRes.data ?? []) as unknown as ChatMessageWithSender[];
    initialReceipts = (receiptsRes.data ?? []) as unknown as Receipt[];
  }

  return (
    <main className="mx-auto flex h-[100dvh] max-w-2xl flex-col">
      <PartyChatContainer
        party={party}
        currentUserId={user.id}
        chatRoom={chatRoom}
        participants={participants}
        pendingParticipants={pendingParticipants}
        initialMessages={initialMessages}
        initialReceipts={initialReceipts}
        pickupLocationName={pickupLocationName}
      />
    </main>
  );
}
