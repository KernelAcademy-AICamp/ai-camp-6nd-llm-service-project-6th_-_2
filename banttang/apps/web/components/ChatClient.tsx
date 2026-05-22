"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatKRW, formatKstShort, minutesUntil } from "@/lib/party-status";
import { cn } from "@/lib/utils";

type Member = {
  user_id: string;
  is_host: boolean;
  nickname: string;
  level: "dandelion" | "tree" | "king";
};

type Msg = {
  id: string;
  sender_id: string | null;
  sender_nickname: string | null;
  type: "text" | "system" | "receipt_card" | "payment_card";
  system_event: string | null;
  content: string | null;
  metadata: any;
  created_at: string;
};

type Props = {
  me: { id: string; nickname: string };
  party: {
    id: string;
    host_id: string;
    status: "recruiting" | "closed" | "in_progress" | "completed" | "cancelled";
    store_name: string;
    representative_menu: string | null;
    max_participants: number;
    price_per_person: number;
    deal_at: string;
    pickup_name: string | null;
    completed_at: string | null;
  };
  members: Member[];
  hasReceipt: boolean;
  receiptInfo: { total_amount: number; price_per_person: number } | null;
  myReviewedIds: string[];
};

export function ChatClient(props: Props) {
  const { me, party, members, hasReceipt, receiptInfo, myReviewedIds } = props;
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isHost = me.id === party.host_id;
  const dealReached = minutesUntil(party.deal_at) <= 0;
  const showCompleteCta = isHost && hasReceipt && party.status === "in_progress";
  const reviewableMembers = members.filter((m) => m.user_id !== me.id);
  const allReviewed = reviewableMembers.every((m) => myReviewedIds.includes(m.user_id));

  const load = useCallback(async () => {
    const r = await fetch(`/api/parties/${party.id}/messages`, { cache: "no-store" });
    const j = await r.json();
    setMessages(j.messages ?? []);
  }, [party.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    const content = input.trim();
    if (!content) return;
    setInput("");
    setBusy(true);
    const r = await fetch(`/api/parties/${party.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "전송 실패");
    } else {
      load();
    }
  }

  async function submitReceipt(storeName: string, amount: number) {
    const r = await fetch(`/api/parties/${party.id}/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_name: storeName, total_amount: amount }),
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error ?? "영수증 등록 실패");
    setShowReceipt(false);
    router.refresh();
    load();
  }

  async function complete() {
    if (!confirm("거래를 완료하시겠어요? 평가 단계로 넘어갑니다.")) return;
    const r = await fetch(`/api/parties/${party.id}/complete`, { method: "POST" });
    const j = await r.json();
    if (!r.ok) return alert(j.error ?? "완료 처리 실패");
    router.refresh();
  }

  async function submitReviews(picks: Record<string, "good" | "bad">, bads: Record<string, string>) {
    const payload = Object.entries(picks).map(([reviewee_id, rating]) => ({
      reviewee_id,
      rating,
      text_review: rating === "bad" ? bads[reviewee_id] || null : null,
    }));
    const r = await fetch(`/api/parties/${party.id}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error ?? "평가 실패");
    setShowReview(false);
    router.refresh();
  }

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      <div className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href={`/feed/${party.id}` as any} className="text-xs text-zinc-400">← 주문 정보</Link>
          <span className="text-[11px] text-zinc-400">
            {formatKstShort(party.deal_at)} · {members.length}명
          </span>
        </div>
        <h2 className="mt-1 font-semibold">{party.store_name}</h2>
        <p className="text-xs text-zinc-500">
          📍 {party.pickup_name ?? "미정"} · {party.price_per_person > 0 ? `1인 ${formatKRW(party.price_per_person)}` : "각자 결제"}
        </p>
        <div className="mt-2 flex gap-1 overflow-x-auto text-[11px]">
          {members.map((m) => (
            <span
              key={m.user_id}
              className={cn(
                "shrink-0 rounded-full bg-zinc-100 px-2 py-0.5",
                m.user_id === me.id && "bg-brand-100 text-brand",
              )}
            >
              {m.is_host ? "👑" : "·"} {m.nickname}
            </span>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-zinc-50 px-3 py-3">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-xs text-zinc-400">메시지 불러오는 중…</p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} meId={me.id} />
            ))}
          </ul>
        )}
        {dealReached && party.status === "in_progress" && !hasReceipt && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-center text-xs text-amber-700">
            ⏰ 반띵 시간이에요. 주문하셨다면 영수증을 인증해주세요.
          </div>
        )}
      </div>

      {/* 하단 액션 + 입력 */}
      <div className="border-t border-zinc-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {party.status !== "completed" && (
            <button
              onClick={() => setShowReceipt(true)}
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs"
            >
              🧾 영수증 인증
            </button>
          )}
          {showCompleteCta && (
            <button
              onClick={complete}
              className="rounded-full bg-brand px-3 py-1 text-xs text-white"
            >
              거래 완료 처리
            </button>
          )}
          {party.status === "completed" && !allReviewed && (
            <button
              onClick={() => setShowReview(true)}
              className="rounded-full bg-brand px-3 py-1 text-xs text-white"
            >
              평가 남기기
            </button>
          )}
          {party.status === "completed" && allReviewed && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">
              ✓ 평가 완료
            </span>
          )}
        </div>
        {party.status !== "completed" ? (
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              placeholder="메시지 입력…"
              className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="rounded-xl bg-brand px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              전송
            </button>
          </div>
        ) : (
          <p className="text-center text-xs text-zinc-400">거래가 종료된 채팅방이에요.</p>
        )}
      </div>

      {showReceipt && (
        <ReceiptModal
          defaultStore={party.store_name}
          maxParticipants={party.max_participants}
          onSubmit={submitReceipt}
          onClose={() => setShowReceipt(false)}
        />
      )}
      {showReview && (
        <ReviewModal
          members={reviewableMembers.filter((m) => !myReviewedIds.includes(m.user_id))}
          onSubmit={submitReviews}
          onClose={() => setShowReview(false)}
          receiptInfo={receiptInfo}
        />
      )}
    </div>
  );
}

function MessageBubble({ msg, meId }: { msg: Msg; meId: string }) {
  if (msg.type === "system") {
    return (
      <li className="text-center">
        <span className="inline-block rounded-full bg-white px-3 py-1 text-[11px] text-zinc-500 shadow-sm">
          {msg.content}
        </span>
      </li>
    );
  }
  if (msg.type === "receipt_card") {
    return (
      <li className="flex justify-center">
        <div className="w-3/4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="font-semibold">🧾 영수증 인증</div>
          <div className="mt-1">{msg.content}</div>
          <div className="mt-1 text-[10px] text-amber-600">
            검증 통과 · {msg.sender_nickname ?? "?"} 업로드
          </div>
        </div>
      </li>
    );
  }
  const mine = msg.sender_id === meId;
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className="max-w-[75%]">
        {!mine && (
          <div className="mb-0.5 ml-2 text-[10px] text-zinc-400">{msg.sender_nickname}</div>
        )}
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm",
            mine ? "bg-brand text-white" : "bg-white text-zinc-800 shadow-sm",
          )}
        >
          {msg.content}
        </div>
      </div>
    </li>
  );
}

function ReceiptModal({
  defaultStore,
  maxParticipants,
  onSubmit,
  onClose,
}: {
  defaultStore: string;
  maxParticipants: number;
  onSubmit: (storeName: string, amount: number) => void;
  onClose: () => void;
}) {
  const [storeName, setStoreName] = useState(defaultStore);
  const [amount, setAmount] = useState(20000);
  const perPerson = Math.ceil(amount / maxParticipants);
  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-lg font-semibold">영수증 인증</h3>
      <div className="mt-3 flex h-32 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
        📷 사진 업로드 placeholder (가짜 OCR 통과)
      </div>
      <label className="mt-3 block text-xs text-zinc-500">가게명</label>
      <input
        value={storeName}
        onChange={(e) => setStoreName(e.target.value)}
        className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
      />
      <label className="mt-3 block text-xs text-zinc-500">총 결제 금액</label>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value) || 0)}
        className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
      />
      <p className="mt-2 text-xs text-zinc-400">
        1인 분담 ≈ {perPerson.toLocaleString()}원 (정원 {maxParticipants}명 기준)
      </p>
      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl border border-zinc-200 py-2">취소</button>
        <button
          onClick={() => onSubmit(storeName, amount)}
          className="flex-1 rounded-xl bg-brand py-2 text-white"
        >
          인증 등록
        </button>
      </div>
    </ModalShell>
  );
}

function ReviewModal({
  members,
  receiptInfo,
  onSubmit,
  onClose,
}: {
  members: Member[];
  receiptInfo: { total_amount: number; price_per_person: number } | null;
  onSubmit: (picks: Record<string, "good" | "bad">, bads: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [picks, setPicks] = useState<Record<string, "good" | "bad">>({});
  const [bads, setBads] = useState<Record<string, string>>({});
  const allPicked = members.every((m) => picks[m.user_id]);
  const needReasonOk = members.every(
    (m) => picks[m.user_id] !== "bad" || (bads[m.user_id] && bads[m.user_id].trim().length > 0),
  );

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-lg font-semibold">반띵 어땠어요?</h3>
      {receiptInfo && (
        <p className="mt-1 text-xs text-zinc-500">
          이번 반띵 금액: 1인 {receiptInfo.price_per_person.toLocaleString()}원
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {members.map((m) => {
          const cur = picks[m.user_id];
          return (
            <li key={m.user_id} className="rounded-xl border border-zinc-200 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{m.is_host ? "👑" : "🌱"} {m.nickname}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPicks((p) => ({ ...p, [m.user_id]: "good" }))}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      cur === "good"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 text-zinc-500",
                    )}
                  >
                    👍 붐업
                  </button>
                  <button
                    onClick={() => setPicks((p) => ({ ...p, [m.user_id]: "bad" }))}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      cur === "bad"
                        ? "border-rose-400 bg-rose-50 text-rose-700"
                        : "border-zinc-200 text-zinc-500",
                    )}
                  >
                    👎 붐따
                  </button>
                </div>
              </div>
              {cur === "bad" && (
                <textarea
                  value={bads[m.user_id] ?? ""}
                  onChange={(e) => setBads((b) => ({ ...b, [m.user_id]: e.target.value }))}
                  placeholder="이유를 적어주세요 (필수)"
                  rows={2}
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-1 text-xs"
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-xl border border-zinc-200 py-2">
          나중에
        </button>
        <button
          disabled={!allPicked || !needReasonOk}
          onClick={() => onSubmit(picks, bads)}
          className="flex-1 rounded-xl bg-brand py-2 text-white disabled:opacity-50"
        >
          평가 제출
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
      >
        {children}
      </div>
    </div>
  );
}
