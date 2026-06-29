import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PartyChatContainer } from "@/components/chat/party-chat-container";
import { closePartyIfFull } from "@/app/_actions/party-lifecycle";
import { ensureAvocadoNoticeMessage } from "@/app/_actions/ensure-avocado-notice";
import { ensureDoorbellNoticeMessage } from "@/app/_actions/ensure-doorbell-notice";
import { parseEwkbPoint } from "@/lib/queries";
import { DEFAULT_ENTRY_NOTICE } from "@/lib/types/avocado-notice";
import type {
  ChatMessageWithSender,
  PartyParticipantWithProfile,
  PartyWithStats,
  Receipt,
} from "@/lib/types/domain";

export const dynamic = "force-dynamic";

// soorimoo URL(/chat/[partyId]) 유지 + rin의 PartyChatContainer로 렌더.
// 중간 지점 추천·영수증·완료 시트 모두 rin 구현이 그대로 동작한다.
export default async function ChatPage({ params }: { params: { partyId: string } }) {
  const { partyId } = params;
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // 정원 다 찼는데 status가 recruiting이면 마감 + 채팅방 생성 (자동 복구)
  await closePartyIfFull(partyId);

  // 1) 파티 본문
  const partyRes = await supabase
    .from("v_parties_with_stats")
    .select("*")
    .eq("id", partyId)
    .maybeSingle<PartyWithStats>();
  if (!partyRes.data) notFound();
  const party = partyRes.data;

  // 아보카도 봇 입장 안내(방당 1건) — 거래 유형 안내를 카드 한 장에 함께 담는다(B안).
  await ensureAvocadoNoticeMessage(
    partyId,
    {
      version: DEFAULT_ENTRY_NOTICE.version,
      title: DEFAULT_ENTRY_NOTICE.title,
      body: DEFAULT_ENTRY_NOTICE.body,
    },
    {
      category: party.category as "delivery" | "offline_shopping" | "online_shopping",
      pricePerPerson: party.price_per_person,
    },
  );

  // 거래 1시간 전 — 아보카도가 띵동 안내를 별도 메시지로 전송(방당 1회).
  await ensureDoorbellNoticeMessage(partyId, party.deal_at);

  // 1.5) 읽음 처리(last_read_at 갱신)는 여기(렌더 도중)에서 하지 않는다.
  //   렌더 중 UPDATE → Realtime party_participants UPDATE → BottomNav/ChatListRealtime의
  //   router.refresh() → 재렌더 → 또 UPDATE → ... 무한 루프(클릭 이동 시 먹통)가 됐었음.
  //   → PartyChatContainer의 마운트 1회 effect에서 markChatRead()로 처리하도록 옮김.

  // 픽업 장소 이름 + 좌표 (지도 표시용)
  const partyExt = party as PartyWithStats & {
    pickup_location_id?: string | null;
    custom_pickup_name?: string | null;
    custom_pickup_point?: string | null;
  };
  let pickupLocationName: string | null = null;
  let pickupCoord: { lat: number; lng: number } | null = null;
  if (partyExt.pickup_location_id) {
    const pickupRes = await supabase
      .from("pickup_locations")
      .select("name, point")
      .eq("id", partyExt.pickup_location_id)
      .maybeSingle<{ name: string; point: string | null }>();
    pickupLocationName = pickupRes.data?.name ?? null;
    pickupCoord = parseEwkbPoint(pickupRes.data?.point ?? null);
  } else if (partyExt.custom_pickup_name) {
    pickupLocationName = partyExt.custom_pickup_name;
    pickupCoord = parseEwkbPoint(partyExt.custom_pickup_point ?? null);
  }

  // 2) 채팅방
  const roomRes = await supabase
    .from("chat_rooms")
    .select("id, party_id, opened_at, closed_at")
    .eq("party_id", partyId)
    .maybeSingle<{ id: string; party_id: string; opened_at: string; closed_at: string | null }>();
  const chatRoom = roomRes.data;

  // 3) 참여자 (호스트 포함, approved + pending)
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

  // 4) 메시지 + 영수증
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

  // 5) 현재 유저가 이 파티 후기를 모두 작성했는지 (칩을 '거래 완료' ↔ '후기 보기'로 전환)
  const otherApprovedCount = participants.filter(
    (p) => p.user_id !== user.id,
  ).length;
  let hasReviewed = false;
  if (otherApprovedCount > 0) {
    const { count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("party_id", partyId)
      .eq("reviewer_id", user.id);
    hasReviewed = (count ?? 0) >= otherApprovedCount;
  }

  return (
    // 부모(app)/main이 flex flex-col pb-20이라 flex-1로 가용 공간 그대로 사용.
    // input bar(컨테이너의 마지막 자식)는 자연스럽게 pb-20 영역 위쪽 = BottomNav 바로 위에 정렬됨.
    <main className="mx-auto flex w-full flex-1 max-w-md flex-col">
      <PartyChatContainer
        party={party}
        currentUserId={user.id}
        chatRoom={chatRoom}
        participants={participants}
        pendingParticipants={pendingParticipants}
        initialMessages={initialMessages}
        initialReceipts={initialReceipts}
        pickupLocationName={pickupLocationName}
        pickupCoord={pickupCoord}
        hasReviewed={hasReviewed}
      />
    </main>
  );
}
