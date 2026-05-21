"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitReceipt } from "@/lib/api/receipts";
import { completeParty } from "@/lib/api/parties";
import { ChatHeader } from "./chat-header";
import { ChatTimeline } from "./chat-timeline";
import { ChatInputBar } from "./chat-input-bar";
import { ReceiptSheet } from "./receipt-sheet";
import { CompleteSheet, type CompleteSubmitInput } from "./complete-sheet";
import { buildTimeline, type ReceiptCardItem } from "@/lib/types/chat";
import type {
  ChatMessage,
  ChatMessageWithSender,
  PartyParticipantWithProfile,
  PartyWithStats,
  Receipt,
  ReviewRating,
  UserProfile,
} from "@/lib/types/domain";

interface Props {
  party: PartyWithStats;
  currentUserId: string;
  chatRoom: { id: string; party_id: string; opened_at: string; closed_at: string | null } | null;
  participants: PartyParticipantWithProfile[];
  initialMessages: ChatMessageWithSender[];
  initialReceipts: Receipt[];
}

// 채팅방 = 거래 단계 메인 컨테이너 (와이어프레임 08/09/10).
// Realtime 구독으로 메시지·영수증 변경을 스트리밍하고, 영수증 인증/거래 완료는 시트로 처리.
export function PartyChatContainer({
  party,
  currentUserId,
  chatRoom,
  participants,
  initialMessages,
  initialReceipts,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<ChatMessageWithSender[]>(initialMessages);
  const [receipts, setReceipts] = useState<Receipt[]>(initialReceipts);
  const [members, setMembers] = useState<PartyParticipantWithProfile[]>(participants);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
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

  // 호스트: 모집 글 삭제 (DB는 status='cancelled' soft delete). 영수증 등록 전까지만.
  async function handleDeleteParty() {
    if (!isHost || !canManage) return;
    if (!confirm("정말 글을 삭제할까요? 채팅방이 닫히고 참여자가 홈으로 돌아갑니다.")) return;
    setManaging(true);
    try {
      const { error } = await supabase
        .from("parties")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancel_reason: "host_deleted",
        })
        .eq("id", party.id);
      if (error) throw error;
      await appendSystemMessage("🛑 호스트가 글을 삭제했어요.");
      router.push("/");
      router.refresh();
    } catch (err) {
      alert(`글 삭제 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setManaging(false);
    }
  }

  // 호스트: 멤버 강퇴 (status='rejected'). 호스트는 강퇴 불가.
  async function handleKickMember(target: PartyParticipantWithProfile) {
    if (!isHost || !canManage) return;
    if (target.is_host) return;
    if (!confirm(`${target.profile?.nickname ?? "이 멤버"}님을 파티에서 내보낼까요?`)) return;
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
    if (!confirm("정말 채팅방에서 나갈까요?")) return;
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

  const receiptCards: ReceiptCardItem[] = useMemo(
    () => receipts.map((r) => ({ ...r, confidence: r.ocr_confidence ?? null })),
    [receipts],
  );

  const items = useMemo(
    () => buildTimeline(messages, receiptCards),
    [messages, receiptCards],
  );

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

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

      console.log(`[chat] subscribing party-chat:${roomId}`);
      channel = supabase
        .channel(`party-chat:${roomId}`)
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
            console.log(`[chat] received INSERT`, row.id, row.content);
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
          },
        )
        .subscribe((status, err) => {
          console.log(`[chat] subscription status:`, status, err?.message ?? "");
        });
    })();

    // 토큰 갱신 / DevAccountSwitcher로 세션 변경 시 Realtime 토큰 push
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
        console.log(`[chat] realtime auth refreshed for ${session.user?.email}`);
      }
    });

    return () => {
      cancelled = true;
      console.log(`[chat] unsubscribing party-chat:${roomId}`);
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, chatRoom]);

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

  async function handleSubmitReceipt({
    file,
    totalAmount,
  }: {
    file: File;
    totalAmount: number;
  }) {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("세션이 만료되었어요. 다시 로그인해주세요.");
    // FastAPI가 OCR + Claude 검증을 끝낸 뒤 receipts row를 INSERT.
    // INSERT는 Realtime으로도 잡히지만, 즉시 반영하기 위해 응답값도 머지.
    const created = await submitReceipt({
      partyId: party.id,
      file,
      totalAmount,
      accessToken: token,
    });
    setReceipts((prev) =>
      prev.some((r) => r.id === created.id) ? prev : [...prev, created],
    );
  }

  async function handleSubmitComplete(input: CompleteSubmitInput) {
    if (!hostParticipant) throw new Error("호스트 정보를 찾을 수 없어요.");

    // 1) 리뷰 INSERT. 멤버 평가는 good/bad enum, 호스트 평가는 별점 → text_review에 요약.
    const rows = [
      ...input.member_reviews.map((r) => ({
        party_id: party.id,
        reviewer_id: currentUserId,
        reviewee_id: r.reviewee_id,
        rating: r.rating,
        text_review: null as string | null,
      })),
      ...(input.host_review
        ? [
            {
              party_id: party.id,
              reviewer_id: currentUserId,
              reviewee_id: input.host_review.reviewee_id,
              rating: (input.host_review.stars >= 4 ? "good" : "bad") as ReviewRating,
              text_review: input.host_review.comment || null,
            },
          ]
        : []),
    ];

    if (rows.length > 0) {
      const { error: reviewErr } = await supabase.from("reviews").insert(rows);
      if (reviewErr) {
        throw new Error(`평가 등록 실패: ${reviewErr.message}`);
      }
    }

    // 2) 호스트가 동시에 거래 완료 처리하는 경우 → FastAPI 호출
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
          onOpenComplete={() => undefined}
          canManage={canManage}
          managing={managing}
          onDeleteParty={isHost ? handleDeleteParty : undefined}
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
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm font-medium">모집이 마감되면 채팅방이 열려요.</p>
          <p className="text-xs text-foreground/60">
            정원 {party.max_participants}명 / 현재 {party.approved_count}명
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        party={party}
        participants={participantProfiles}
        hostId={party.host_id}
        isHost={isHost}
        onOpenComplete={() => setCompleteOpen(true)}
        onOpenReview={() => setCompleteOpen(true)}
        canManage={canManage}
        managing={managing}
        onDeleteParty={isHost ? handleDeleteParty : undefined}
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

      <ChatTimeline
        items={items}
        currentUserId={currentUserId}
        participantCount={members.length}
        scrollAnchorRef={scrollAnchorRef}
      />

      <ChatInputBar
        onSend={handleSend}
        onAttachReceipt={isHost ? () => setReceiptOpen(true) : undefined}
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
        hostShareAmount={hostShare}
        onSubmit={handleSubmitComplete}
      />
    </div>
  );
}
