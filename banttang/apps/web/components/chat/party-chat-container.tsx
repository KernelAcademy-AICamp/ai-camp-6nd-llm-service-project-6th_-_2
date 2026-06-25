"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { askConfirm } from "@/lib/confirm";
import { uploadChatPhoto } from "@/app/_actions/upload-chat-photo";
import { markChatRead } from "@/app/_actions/mark-chat-read";
import { ringDoorbell } from "@/app/_actions/ring-doorbell";
import { recommendMidpoint } from "@/app/_actions/recommend-midpoint";
import { updatePartyPickup } from "@/app/_actions/update-party-pickup";
import { dismissMidpointRecommendation } from "@/app/_actions/dismiss-midpoint";
import { getBlockedUserIds } from "@/app/_actions/chat-moderation";
import {
  approveParticipant,
  rejectParticipant,
} from "@/app/_actions/participant-decision";
import { verifyReceiptWithClaude } from "@/app/_actions/verify-receipt-claude";
import { completeParty } from "@/lib/api/parties";
import { Avatar } from "@/components/ui/avatar";
import { ChatHeader } from "./chat-header";
import { ChatTimeline } from "./chat-timeline";
import { ChatInputBar } from "./chat-input-bar";
import { ReceiptSheet } from "./receipt-sheet";
import { CompleteSheet, type CompleteSubmitInput } from "./complete-sheet";
import { PartyInfoCard } from "./party-info-card";
import { ActionBanner } from "./action-banner";
import { TransactionCardSheet } from "./transaction-card-sheet";
import { MemberProfileSheet } from "./member-profile-sheet";
import { AvocadoNotice } from "./avocado-notice";
import { buildTimeline, type ReceiptCardItem } from "@/lib/types/chat";
import { derivePhase } from "@/lib/types/phase";
import { DEFAULT_ENTRY_NOTICE } from "@/lib/types/avocado-notice";
import type {
  ChatMessage,
  ChatMessageWithSender,
  PartyParticipantWithProfile,
  PartyWithStats,
  Receipt,
  UserProfile,
} from "@/lib/types/domain";

interface Props {
  party: PartyWithStats;
  currentUserId: string;
  chatRoom: { id: string; party_id: string; opened_at: string; closed_at: string | null } | null;
  participants: PartyParticipantWithProfile[];
  // 호스트 승인 대기 중인 신청자 — 모집 단계 placeholder에 노출.
  pendingParticipants?: PartyParticipantWithProfile[];
  initialMessages: ChatMessageWithSender[];
  initialReceipts: Receipt[];
  pickupLocationName?: string | null;
  // pickup_locations.point 또는 parties.custom_pickup_point에서 파싱한 좌표.
  // TransactionCardSheet에 지도 표시할 때 사용.
  pickupCoord?: { lat: number; lng: number } | null;
}

// 채팅방 = 거래 단계 메인 컨테이너 (와이어프레임 08/09/10).
// Realtime 구독으로 메시지·영수증 변경을 스트리밍하고, 영수증 인증/거래 완료는 시트로 처리.
export function PartyChatContainer({
  party,
  currentUserId,
  chatRoom,
  participants,
  pendingParticipants = [],
  initialMessages,
  initialReceipts,
  pickupLocationName,
  pickupCoord = null,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessageWithSender[]>(initialMessages);
  const [receipts, setReceipts] = useState<Receipt[]>(initialReceipts);
  const [members, setMembers] = useState<PartyParticipantWithProfile[]>(participants);
  const [pendings, setPendings] = useState<PartyParticipantWithProfile[]>(pendingParticipants);
  // user_id → 마지막으로 본 메시지 시각(ISO). Presence(채널)로 동기화.
  const [reads, setReads] = useState<Record<string, string>>({});
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  // 채팅에서 탭한 상대 회원(공개 프로필 시트). null이면 닫힘.
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  // 내가 차단한 회원 id — 차단 시 타임라인에서 상대 메시지를 숨긴다.
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  // 띵동 쿨다운 — 남은 초. 0이면 가능, 5→0으로 카운트다운.
  const [doorbellCooldown, setDoorbellCooldown] = useState(0);
  const [managing, setManaging] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const senderCacheRef = useRef<Map<string, ChatMessageWithSender["sender"]>>(
    new Map(
      initialMessages
        .filter((m) => m.sender)
        .map((m) => [m.sender_id!, m.sender!] as const),
    ),
  );

  const isHost = members.some(
    (p) => p.user_id === currentUserId && p.is_host,
  );
  const hostParticipant = members.find((p) => p.is_host) ?? null;
  const participantProfiles = members.map(
    (p): Pick<UserProfile, "id" | "nickname"> => ({
      id: p.user_id,
      nickname: p.profile?.nickname ?? "알 수 없음",
    }),
  );

  // 영수증 인증 전까지만 강퇴·취소·나가기 허용 (요구사항)
  const canManage =
    receipts.length === 0 && party.status !== "completed" && party.status !== "cancelled";

  // 30초마다 갱신되는 클럭 — 반띵 시간 도달 등 시간 기반 phase 전환을 트리거한다.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // 방이 열려 있는 동안은 "계속 읽음" 상태로 유지한다.
  //   - 진입 시 + 새 메시지가 올 때마다 읽음 처리(last_read_at = now)
  //   → 보고 있는 동안 도착한 메시지도 읽음으로 잡혀, 방을 나가도 안 읽음 숫자가 안 살아남.
  // 무한 루프 없음: 트리거는 messages(클라이언트 상태)·party.id 뿐이다. markChatRead가
  //   부르는 router.refresh()(BottomNav 실시간 구독 경유)는 서버 컴포넌트만 다시 그릴 뿐
  //   messages state를 바꾸지 않으므로 이 effect를 재실행시키지 않는다.
  // 배지 합계 갱신은 BottomNav의 party_participants UPDATE 구독(디바운스 refresh)이 담당.
  // 500ms 디바운스로 메시지 버스트를 한 번으로 합친다.
  const latestMessageId =
    messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    const t = setTimeout(() => {
      void markChatRead(party.id);
    }, 500);
    return () => clearTimeout(t);
  }, [party.id, latestMessageId]);

  // 방을 나갈 때(언마운트) 한 번 더 읽음 처리 — 디바운스 때문에 미처 못 보낸 직전
  // 메시지까지 확실히 읽음으로 만든다. 나간 뒤 BottomNav 구독이 배지를 곧 갱신한다.
  useEffect(() => {
    return () => {
      void markChatRead(party.id);
    };
  }, [party.id]);

  // F203 4단계 + 종결 상태. derivePhase는 영수증/반띵 시간을 함께 본다.
  const phase = derivePhase({
    status: party.status,
    receipts,
    dealAt: party.deal_at,
    now: new Date(nowMs),
  });
  // 메시지 전송 잠금은 'cancelled'만. 'completed' 후에도 평가/소통은 가능.
  // 단, 호스트 액션(영수증 등록·거래 완료 버튼 등)은 isPostTrade로 별도 잠금.
  const isReadOnly = phase === "cancelled";
  const isPostTrade = phase === "completed" || phase === "cancelled";

  // 띵동 활성화: deal_at - 15분 ~ deal_at + 60분
  // [TEMP-DEV] 테스트 위해 30일로 확장. 운영 전 원복:
  //   nowMs >= dealMs - 15 * 60 * 1000 && nowMs <= dealMs + 60 * 60 * 1000
  const dealMs = new Date(party.deal_at).getTime();
  const DOORBELL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const doorbellActive =
    !!chatRoom &&
    nowMs >= dealMs - DOORBELL_WINDOW_MS &&
    nowMs <= dealMs + DOORBELL_WINDOW_MS &&
    party.status !== "completed" &&
    party.status !== "cancelled";

  // 띵동 쿨다운 카운트다운 (1초마다 -1, 0이면 정지)
  useEffect(() => {
    if (doorbellCooldown <= 0) return;
    const id = setTimeout(() => setDoorbellCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [doorbellCooldown]);

  async function handleRingDoorbell() {
    if (doorbellCooldown > 0) return;
    // 쿨다운 즉시 시작 (서버 에러 와도 5초 잠금 — 도배 방지 일관성)
    setDoorbellCooldown(5);
    const res = await ringDoorbell(party.id);
    if (!res.ok) alert(res.error);
  }

  const readOnlyHint =
    phase === "cancelled"
      ? "이 반띵은 취소되어 메시지를 보낼 수 없어요."
      : "완료된 반띵이에요. 메시지를 보낼 수 없어요.";

  async function appendSystemMessage(content: string) {
    if (!chatRoom) return;
    // chat_messages는 시스템 메시지를 type='system'로 받지만 RLS는 type='text'만 INSERT 허용할 수 있어
    // 실패해도 비치명적이므로 에러 무시.
    await supabase
      .from("chat_messages")
      .insert({
        room_id: chatRoom.id,
        sender_id: null,
        type: "system",
        content,
      })
      .then(() => undefined, () => undefined);
  }

  // 호스트: 멤버 강퇴 (status='rejected'). 호스트는 강퇴 불가.
  async function handleKickMember(target: PartyParticipantWithProfile) {
    if (!isHost || !canManage) return;
    if (target.is_host) return;
    const ok = await askConfirm({
      title: `${target.profile?.nickname ?? "이 멤버"}님을 내보낼까요?`,
      description: "내보낸 후에는 다시 참여 요청을 받아야 합니다.",
      confirmText: "내보내기",
      destructive: true,
    });
    if (!ok) return;
    setManaging(true);
    try {
      const { error } = await supabase
        .from("party_participants")
        .update({ status: "rejected" })
        .eq("id", target.id);
      if (error) throw error;
      setMembers((prev) => prev.filter((m) => m.id !== target.id));
      await appendSystemMessage(
        `🚪 ${target.profile?.nickname ?? "참여자"}님이 파티에서 제외됐어요.`,
      );
    } catch (err) {
      alert(`강퇴 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setManaging(false);
    }
  }

  // 멤버: 본인 채팅방 나가기 (status='cancelled'). 호스트는 이 액션 안 보임.
  async function handleLeaveChat() {
    if (isHost || !canManage) return;
    const ok = await askConfirm({
      title: "채팅방에서 나갈까요?",
      description: "지금 나가면 이 모집에 다시 참여할 수 없어요.",
      confirmText: "나가기",
      destructive: true,
    });
    if (!ok) return;
    setManaging(true);
    try {
      const me = members.find((m) => m.user_id === currentUserId);
      if (!me) throw new Error("내 참여 row를 찾지 못했어요.");
      const { error } = await supabase
        .from("party_participants")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", me.id);
      if (error) throw error;
      await appendSystemMessage(
        `👋 ${me.profile?.nickname ?? "참여자"}님이 채팅방을 나갔어요.`,
      );
      router.push("/");
      router.refresh();
    } catch (err) {
      alert(`나가기 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setManaging(false);
    }
  }

  // 호스트: 신청자 승인 — server action 경유로 admin client 사용
  // (트리거 SECURITY DEFINER 미적용 환경에서도 안전하게 chat_rooms 등 INSERT 가능)
  async function handleApprove(target: PartyParticipantWithProfile) {
    if (!isHost) return;
    setManaging(true);
    try {
      const res = await approveParticipant(target.id);
      if (!res.ok) throw new Error(res.error);
      setPendings((prev) => prev.filter((p) => p.id !== target.id));
      setMembers((prev) => [...prev, { ...target, status: "approved" }]);
      router.refresh();
    } catch (err) {
      alert(`승인 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setManaging(false);
    }
  }

  async function handleReject(target: PartyParticipantWithProfile) {
    if (!isHost) return;
    const ok = await askConfirm({
      title: `${target.profile?.nickname ?? "이 신청자"}님을 거절할까요?`,
      description: "거절한 후에는 같은 사람의 재신청을 다시 받아야 합니다.",
      confirmText: "거절하기",
      destructive: true,
    });
    if (!ok) return;
    setManaging(true);
    try {
      const res = await rejectParticipant(target.id);
      if (!res.ok) throw new Error(res.error);
      setPendings((prev) => prev.filter((p) => p.id !== target.id));
    } catch (err) {
      alert(`거절 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setManaging(false);
    }
  }

  const receiptCards: ReceiptCardItem[] = useMemo(
    () => receipts.map((r) => ({ ...r, confidence: r.ocr_confidence ?? null })),
    [receipts],
  );

  // 차단한 회원의 메시지는 타임라인에서 제외(시스템 메시지는 sender_id 없음 → 유지).
  const items = useMemo(
    () =>
      buildTimeline(
        blockedIds.size ? messages.filter((m) => !m.sender_id || !blockedIds.has(m.sender_id)) : messages,
        receiptCards,
      ),
    [messages, receiptCards, blockedIds],
  );

  // 차단 목록 로드(마운트 1회). 프로필 시트에서 차단/해제하면 setBlockedIds로 즉시 갱신.
  useEffect(() => {
    let alive = true;
    getBlockedUserIds()
      .then((ids) => alive && setBlockedIds(new Set(ids)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  // F401 — 반띵 시간 도달 + 인증 완료 시점에 거래 확인 모달 자동 오픈.
  // phase가 review_pending에 도달한 첫 시점에 한 번만 오픈한다 (사용자가 닫고 다시 작업할 수 있도록).
  const autoOpenedForPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== "review_pending") return;
    if (autoOpenedForPhaseRef.current === "review_pending") return;
    autoOpenedForPhaseRef.current = "review_pending";
    setCompleteOpen(true);
  }, [phase]);

  // 중간지점 추천 — 채팅방이 열린 시점(=정원이 다 모인 시점)에 1회 게시.
  // server action이 idempotent하므로 페이지 새로고침/멤버 동시 진입에도 한 번만 INSERT 된다.
  const midpointTriggeredRef = useRef(false);
  useEffect(() => {
    if (!chatRoom) return;
    if (midpointTriggeredRef.current) return;
    const already = messages.some(
      (m) =>
        m.type === "system" &&
        (m.metadata as { kind?: unknown } | null)?.kind === "midpoint_recommendation",
    );
    if (already) {
      midpointTriggeredRef.current = true;
      return;
    }
    midpointTriggeredRef.current = true;
    // 결과는 Realtime INSERT 구독으로 자동 반영됨
    void recommendMidpoint(party.id).catch(() => undefined);
  }, [chatRoom, messages, party.id]);

  // Realtime: chat_messages INSERT (room 있을 때만)
  // 디버깅을 돕기 위해 status / 수신 로그를 console에 남긴다.
  useEffect(() => {
    if (!chatRoom) return;
    const roomId = chatRoom.id;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // subscribe 전에 access_token을 Realtime에 박는다 — 안 그러면 RLS-aware Realtime이
    // 메시지를 못 받음. setAuth가 async라 await 후 subscribe.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }
      if (cancelled) return;

      channel = supabase
        .channel(`party-chat:${roomId}`, {
          config: { presence: { key: currentUserId } },
        })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
            filter: `room_id=eq.${roomId}`,
          },
          async (payload) => {
            const row = payload.new as ChatMessage;
            let sender = row.sender_id
              ? senderCacheRef.current.get(row.sender_id) ?? null
              : null;
            if (!sender && row.sender_id) {
              const { data: profData } = await supabase
                .from("profiles")
                .select("id, nickname")
                .eq("id", row.sender_id)
                .maybeSingle();
              sender = (profData as ChatMessageWithSender["sender"]) ?? null;
              if (sender) senderCacheRef.current.set(row.sender_id, sender);
            }
            setMessages((prev) =>
              prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, sender }],
            );
            // 내가 채팅방을 보고 있으니 새 메시지를 받은 시점에 last_read_at 갱신
            if (channel) {
              await channel.track({
                user_id: currentUserId,
                last_read_at: new Date(row.created_at).toISOString(),
              });
            }
          },
        )
        .on("presence", { event: "sync" }, () => {
          if (!channel) return;
          const state = channel.presenceState() as Record<
            string,
            Array<{ user_id?: string; last_read_at?: string }>
          >;
          const map: Record<string, string> = {};
          for (const presences of Object.values(state)) {
            for (const p of presences) {
              if (!p.user_id || !p.last_read_at) continue;
              const cur = map[p.user_id];
              if (!cur || p.last_read_at > cur) {
                map[p.user_id] = p.last_read_at;
              }
            }
          }
          setReads(map);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && channel) {
            // 채팅방 진입 = 모든 기존 메시지를 읽음으로 처리
            await channel.track({
              user_id: currentUserId,
              last_read_at: new Date().toISOString(),
            });
            presenceChannelRef.current = channel;
          }
        });
    })();

    // 토큰 갱신 / DevAccountSwitcher로 세션 변경 시 Realtime 토큰 push
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
    });

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      presenceChannelRef.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, chatRoom, currentUserId]);

  // Realtime: receipts INSERT (FastAPI가 검증 완료 후 row를 만들면 카드로 등장)
  useEffect(() => {
    const channel = supabase
      .channel(`party-receipts:${party.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "receipts",
          filter: `party_id=eq.${party.id}`,
        },
        (payload) => {
          const row = payload.new as Receipt;
          setReceipts((prev) =>
            prev.some((r) => r.id === row.id) ? prev : [...prev, row],
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, party.id]);

  async function handleSend(body: string) {
    if (!chatRoom) return;
    const { error } = await supabase.from("chat_messages").insert({
      room_id: chatRoom.id,
      sender_id: currentUserId,
      type: "text",
      content: body,
    });
    if (error) {
      alert(`메시지를 보내지 못했어요: ${error.message}`);
    }
  }

  // 이미지 첨부 — 서버 액션으로 admin 업로드 후 chat_messages INSERT.
  // 메시지 type은 'text', 본문은 빈 문자열, metadata에 storage_path/public_url 적재.
  async function handleAttachImage(file: File) {
    if (!chatRoom) return;
    const { width, height } = await readImageSize(file).catch(() => ({ width: 0, height: 0 }));
    const fd = new FormData();
    fd.append("file", file);
    fd.append("party_id", party.id);
    if (width) fd.append("width", String(width));
    if (height) fd.append("height", String(height));
    const result = await uploadChatPhoto(fd);
    if (!result.ok) {
      throw new Error(result.error);
    }
    const { error } = await supabase.from("chat_messages").insert({
      room_id: chatRoom.id,
      sender_id: currentUserId,
      type: "text",
      content: "",
      metadata: {
        kind: "image",
        storage_path: result.data.storage_path,
        public_url: result.data.public_url,
        width: result.data.width ?? null,
        height: result.data.height ?? null,
      },
    });
    if (error) throw new Error(`메시지 등록 실패: ${error.message}`);
  }

  async function handleSubmitReceipt({ file }: { file: File }) {
    // Claude Vision으로 직접 검증 + 금액 추출 (실제 영수증 + 쇼핑앱/카드사 캡처 모두 처리).
    // 금액은 사용자 입력 X — LLM이 OCR로 추출 (정책: 영수증 인증=LLM, 정산=산수).
    // receipts row INSERT + receipt_card 시스템 메시지까지 server action에서 묶어서 처리.
    const fd = new FormData();
    fd.append("file", file);
    fd.append("party_id", party.id);
    const res = await verifyReceiptWithClaude(fd);
    if (!res.ok) throw new Error(res.error);
    if (!res.data.verified) {
      // verified=false면 사유를 그대로 throw — ReceiptSheet의 humanizeError가 한글 메시지로 그대로 노출
      throw new Error(res.data.reason);
    }
    // Realtime 구독으로도 receipts 추가가 들어오지만, 즉시 반영 위해 직접 fetch
    if (res.data.receipt_id) {
      const { data: row } = await supabase
        .from("receipts")
        .select(
          "id, party_id, uploader_id, storage_path, ocr_store_name, ocr_total_amount, ocr_paid_at, ocr_confidence, final_store_name, final_total_amount, final_paid_at, price_per_person, shared_to_chat_at, created_at, updated_at",
        )
        .eq("id", res.data.receipt_id)
        .maybeSingle<Receipt>();
      if (row) {
        setReceipts((prev) =>
          prev.some((r) => r.id === row.id) ? prev : [...prev, row],
        );
      }
    }
  }

  async function handleSubmitComplete(input: CompleteSubmitInput) {
    if (!hostParticipant) throw new Error("호스트 정보를 찾을 수 없어요.");

    // 1) reviews upsert — F403/F404. 사유는 text_review에 담는다(스키마 ≤200자).
    const reviewRows = input.reviews.map((r) => ({
      party_id: party.id,
      reviewer_id: currentUserId,
      reviewee_id: r.reviewee_id,
      rating: r.rating,
      text_review: r.reason ?? null,
    }));
    if (reviewRows.length > 0) {
      const { error: reviewErr } = await supabase
        .from("reviews")
        .upsert(reviewRows, { onConflict: "party_id,reviewer_id,reviewee_id" });
      if (reviewErr) {
        throw new Error(`평가 등록 실패: ${reviewErr.message}`);
      }
    }

    // 2) payments upsert — F402. 멤버 시점에서만, 호스트에게 부담한 금액 기록.
    if (input.my_paid_amount && !isHost) {
      const { error: payErr } = await supabase.from("payments").upsert(
        {
          party_id: party.id,
          payer_id: currentUserId,
          receiver_id: hostParticipant.user_id,
          amount: input.my_paid_amount,
          method: "other",
          status: "sent_by_payer",
          sent_at: new Date().toISOString(),
        },
        { onConflict: "party_id,payer_id,receiver_id" },
      );
      if (payErr) {
        throw new Error(`송금 기록 실패: ${payErr.message}`);
      }
    }

    // 3) 호스트가 동시에 거래 완료 처리하는 경우 → FastAPI 호출
    if (input.also_complete_transaction) {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("세션이 만료되었어요.");
      await completeParty({ partyId: party.id, accessToken: token });
    }
  }

  const latestReceipt = receipts[receipts.length - 1];
  const hostShare = latestReceipt?.price_per_person;

  // 모집 단계: 채팅방 아직 없음 → 안내 화면
  if (!chatRoom) {
    return (
      <>
        <ChatHeader
          party={party}
          participants={participantProfiles}
          hostId={party.host_id}
          isHost={isHost}
          canManage={canManage}
          managing={managing}
          onLeaveParty={!isHost ? handleLeaveChat : undefined}
          onKickMember={
            isHost
              ? (uid) => {
                  const target = members.find((m) => m.user_id === uid);
                  if (target) handleKickMember(target);
                }
              : undefined
          }
        />
        <PartyInfoCard
          party={party}
          pickupLocationName={pickupLocationName}
          isHost={isHost}
          onVerifyReceipt={
            isHost && !isPostTrade ? () => setReceiptOpen(true) : undefined
          }
        />

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#f5f6f8] p-4">
          {/* 호스트 시점: 신청자 승인 UI */}
          {isHost && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.05]">
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-bold text-gray-900">참여 신청</h2>
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                  {pendings.length}건
                </span>
              </div>
              {pendings.length === 0 ? (
                <p className="mt-3 text-[12px] text-gray-400">
                  아직 새로운 신청이 없어요.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {pendings.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
                    >
                      <Avatar nickname={p.profile?.nickname ?? "?"} size={36} />
                      <p className="flex-1 truncate text-[14px] font-semibold text-gray-900">
                        {p.profile?.nickname ?? "참여자"}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleReject(p)}
                        disabled={managing}
                        className="h-8 shrink-0 rounded-full bg-white px-3 text-[12px] font-bold text-gray-700 ring-1 ring-black/10 transition-colors active:bg-gray-100 disabled:opacity-50"
                      >
                        거절
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(p)}
                        disabled={managing}
                        className="h-8 shrink-0 rounded-full bg-brand px-3 text-[12px] font-bold text-white transition-opacity active:opacity-80 disabled:opacity-50"
                      >
                        승인
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* 멤버 시점: 자기 상태 안내 */}
          {!isHost && (() => {
            const me = pendings.find((p) => p.user_id === currentUserId);
            if (me) {
              return (
                <section className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                  <p className="text-[14px] font-bold text-amber-900">
                    호스트의 승인을 기다리고 있어요
                  </p>
                  <p className="mt-1 text-[12px] text-amber-800/80">
                    승인되면 채팅방이 자동으로 열립니다.
                  </p>
                </section>
              );
            }
            return null;
          })()}

          {/* 공통 모집 현황 */}
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-6 text-center ring-1 ring-black/[0.05]">
            <p className="text-[14px] font-bold text-gray-900">
              모집이 마감되면 채팅방이 열려요
            </p>
            <p className="text-[12px] text-gray-500">
              정원 {party.max_participants}명 / 현재{" "}
              <span className="font-semibold text-brand">
                {party.approved_count}명
              </span>
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    // relative — AvocadoNotice FAB/말풍선이 absolute로 우하단에 정렬되도록.
    // flex-1 — h-full 대신 사용. 부모 flex-col 체인에서 가용 높이 안정적으로 채움
    // (이전 h-full은 일부 케이스에서 컨텐츠 높이로만 줄어 input bar가 중앙 부근에 떠 있었음).
    <div className="relative flex flex-1 flex-col">
      <ChatHeader
        party={party}
        participants={participantProfiles}
        hostId={party.host_id}
        isHost={isHost}
        onOpenReview={() => setCompleteOpen(true)}
        canManage={canManage}
        managing={managing}
        onLeaveParty={!isHost ? handleLeaveChat : undefined}
        onKickMember={
          isHost
            ? (uid) => {
                const target = members.find((m) => m.user_id === uid);
                if (target) handleKickMember(target);
              }
            : undefined
        }
      />

      {/* 정보 카드 자리 — '반띵 카드 보기' + 호스트 전용 '주문 인증' 가로 병렬. */}
      <section className="flex items-center gap-2 border-b border-black/[0.06] bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setCardOpen(true)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand/10 px-4 py-3 text-[14px] font-semibold text-brand transition-colors active:bg-brand/15"
        >
          <span aria-hidden>🪪</span>
          <span>반띵 카드 보기</span>
        </button>
        {isHost && (() => {
          // 영수증 등록됐거나 거래가 끝난 후엔 비활성 "인증 완료" 상태로 노출.
          // 진행 단계에서만 클릭 가능.
          const isVerified = receipts.length > 0;
          const lockedAfterTrade = isPostTrade; // completed/cancelled
          const disabled = isVerified || lockedAfterTrade;
          return (
            <button
              type="button"
              onClick={() => !disabled && setReceiptOpen(true)}
              disabled={disabled}
              className={
                disabled
                  ? "flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-200 px-4 py-3 text-[14px] font-semibold text-zinc-500 cursor-not-allowed"
                  : "flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-4 py-3 text-[14px] font-semibold text-white transition-opacity active:opacity-80"
              }
            >
              <span aria-hidden>{isVerified ? "✓" : "🧾"}</span>
              <span>{isVerified ? "인증 완료" : "주문 인증"}</span>
            </button>
          );
        })()}
      </section>

      <ChatTimeline
        items={items}
        currentUserId={currentUserId}
        isHost={isHost}
        participantCount={members.length}
        memberUserIds={members.map((m) => m.user_id)}
        reads={reads}
        scrollAnchorRef={scrollAnchorRef}
        onOpenTransactionCard={() => setCardOpen(true)}
        onTapMember={(uid) => setProfileUserId(uid)}
        onChangePickup={
          isHost
            ? async (input) => {
                const res = await updatePartyPickup({
                  partyId: party.id,
                  name: input.name,
                  lat: input.lat,
                  lng: input.lng,
                });
                if (!res.ok) throw new Error(res.error);
                // 가장 최근 midpoint 메시지를 'confirmed'로 로컬 즉시 반영
                setMessages((prev) =>
                  markLatestMidpoint(prev, "confirmed"),
                );
                router.refresh();
              }
            : undefined
        }
        onDismissMidpoint={
          isHost
            ? async (messageId) => {
                const res = await dismissMidpointRecommendation(messageId);
                if (!res.ok) throw new Error(res.error);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          metadata: {
                            ...(m.metadata ?? {}),
                            decided: "dismissed",
                          },
                        }
                      : m,
                  ),
                );
              }
            : undefined
        }
      />

      {/* 단계별 액션 안내 — 호스트가 영수증을 등록하거나 모두가 평가를 제출하도록 유도. */}
      {phase === "verify_pending" && isHost && (
        <ActionBanner
          tone="warning"
          icon="receipt"
          title="주문 내역을 인증해주세요"
          description="반띵 시간이 다가왔어요. 영수증 또는 결제 내역을 등록하면 거래 확인 단계로 넘어갑니다."
          actionLabel="영수증 등록"
          onAction={() => setReceiptOpen(true)}
        />
      )}
      {phase === "verify_pending" && !isHost && (
        <ActionBanner
          tone="warning"
          icon="receipt"
          title="호스트의 주문 내역 인증을 기다리고 있어요"
          description="반띵 시간이 다가왔어요. 호스트가 영수증을 등록하면 거래 확인 단계로 넘어갑니다."
        />
      )}
      {/* 거래 완료 처리는 파티원만 — 영수증 인증 직후부터 노출 (verified/review_pending).
          버튼 클릭 시 후기 작성 페이지로 이동만 한다. 후기 작성 완료 전까지는 'completed' 전이 X. */}
      {(phase === "verified" || phase === "review_pending") && !isHost && (
        <ActionBanner
          tone="info"
          icon="check"
          title="거래를 완료해주세요"
          description="주문 내역과 결제 금액이 맞는지 확인하고 후기를 작성하면 거래가 완료됩니다."
          actionLabel="거래 완료"
          onAction={() => router.push(`/mypage/reviews/${party.id}` as any)}
        />
      )}
      {/* 완료된 반띵 — 마이페이지 후기 작성 화면으로 진입. 작성/조회 화면이 같은 라우트라
          이미 쓴 사람도 같은 버튼으로 본인 후기 확인 가능. */}
      {phase === "completed" && (
        <ActionBanner
          tone="info"
          icon="check"
          title="거래가 완료되었어요"
          description="함께한 분들에게 후기를 남겨보세요. 이미 작성했다면 후기를 다시 볼 수 있어요."
          actionLabel="거래 후기 작성"
          onAction={() => router.push(`/mypage/reviews/${party.id}` as any)}
        />
      )}

      {/* 띵동 — 거래 시각 ±윈도우 내에서만 활성. 호스트는 전원 broadcast, 참여자는 호스트에게만. */}
      {doorbellActive && (
        <ActionBanner
          tone="info"
          icon="check"
          title="이제 띵동할 수 있어요"
          description={
            isHost
              ? "다 모였으면 모든 멤버에게 띵동을 보내 위치를 알려주세요."
              : "현장에 도착했으면 호스트에게 띵동을 보내세요."
          }
          actionLabel={
            doorbellCooldown > 0 ? `다시 띵동까지 ${doorbellCooldown}초` : "🔔 띵동하기"
          }
          onAction={doorbellCooldown > 0 ? () => {} : handleRingDoorbell}
        />
      )}

      <ChatInputBar
        onSend={handleSend}
        onAttachImage={!isReadOnly ? handleAttachImage : undefined}
        readOnly={isReadOnly}
        readOnlyHint={readOnlyHint}
      />

      {/* 방장봇 아보카도 — FAB + 입장 안내. storage key는 사용자×파티 단위. */}
      <AvocadoNotice
        notice={DEFAULT_ENTRY_NOTICE}
        storageKey={`avocado-notice:${party.id}:${currentUserId}`}
      />

      <ReceiptSheet
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        onSubmit={handleSubmitReceipt}
      />

      <CompleteSheet
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        participants={members.map((p) => ({
          id: p.user_id,
          nickname: p.profile?.nickname ?? "알 수 없음",
          is_host: p.is_host,
        }))}
        currentUserId={currentUserId}
        isHost={isHost}
        suggestedAmount={hostShare}
        verifiedTotal={latestReceipt?.final_total_amount}
        onSubmit={handleSubmitComplete}
      />

      <TransactionCardSheet
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        party={party}
        pickupName={pickupLocationName ?? null}
        pickupCoord={pickupCoord}
        members={members.map((p) => ({
          user_id: p.user_id,
          nickname: p.profile?.nickname ?? "알 수 없음",
          is_host: p.is_host,
        }))}
      />

      {/* 채팅에서 회원 탭 → 공개 프로필 시트 */}
      <MemberProfileSheet
        userId={profileUserId}
        currentUserId={currentUserId}
        partyName={party.store_name}
        partyId={party.id}
        isHost={members.some((m) => m.user_id === profileUserId && m.is_host)}
        onClose={() => setProfileUserId(null)}
        onBlockChange={(uid, blocked) =>
          setBlockedIds((prev) => {
            const next = new Set(prev);
            if (blocked) next.add(uid);
            else next.delete(uid);
            return next;
          })
        }
      />
    </div>
  );
}

// 브라우저에서 이미지 자연 크기 추출 (메타에 저장해 타임라인 레이아웃 안정화에 사용).
function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const { naturalWidth, naturalHeight } = img;
      URL.revokeObjectURL(url);
      resolve({ width: naturalWidth, height: naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

// 메시지 배열에서 가장 최근 midpoint_recommendation 시스템 메시지를 찾아 decided 값을 박는다.
// 서버 측 update-party-pickup의 로직과 동일하게 동작하도록 클라이언트도 즉시 반영.
function markLatestMidpoint(
  msgs: ChatMessageWithSender[],
  decided: "confirmed" | "dismissed",
): ChatMessageWithSender[] {
  let latestIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    const kind = (m.metadata as { kind?: unknown } | null)?.kind;
    if (m.type === "system" && kind === "midpoint_recommendation") {
      latestIdx = i;
      break;
    }
  }
  if (latestIdx < 0) return msgs;
  const target = msgs[latestIdx];
  const newMsg = {
    ...target,
    metadata: { ...(target.metadata ?? {}), decided },
  };
  return [...msgs.slice(0, latestIdx), newMsg, ...msgs.slice(latestIdx + 1)];
}
