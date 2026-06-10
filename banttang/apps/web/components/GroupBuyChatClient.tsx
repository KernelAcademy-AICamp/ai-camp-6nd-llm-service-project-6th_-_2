"use client";

// 공구 안내 챗봇 — 규칙(버튼) 기반 자동응답.
// 참여 즉시 계좌번호를 안내하고, 빠른 질문 버튼에 정해진 답을 돌려준다. (실제 상담원 X)

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { markGroupBuyPaid } from "@/app/_actions/group-buy";
import type { GroupBuy } from "@/lib/groupbuy";
import { cn, formatKrw } from "@/lib/utils";

type Msg =
  | { id: number; role: "bot" | "user"; kind: "text"; text: string }
  | { id: number; role: "bot"; kind: "account" };

export function GroupBuyChatClient({
  gb,
  nickname,
  optionLabel,
  unitPrice,
  quantity,
  alreadyPaid,
}: {
  gb: GroupBuy;
  nickname: string;
  optionLabel: string;
  unitPrice: number;
  quantity: number;
  alreadyPaid: boolean;
}) {
  const router = useRouter();
  const amount = unitPrice * quantity;
  const idRef = useRef(3);
  const nextId = () => ++idRef.current;

  const [messages, setMessages] = useState<Msg[]>(() => [
    {
      id: 1,
      role: "bot",
      kind: "text",
      text: `🍑 ${gb.title} 공구에 참여해주셔서 감사해요!\n아래 계좌로 입금해주시면 참여가 확정돼요.`,
    },
    { id: 2, role: "bot", kind: "account" },
    {
      id: 3,
      role: "bot",
      kind: "text",
      text: alreadyPaid
        ? "입금 완료를 알려주셨어요. 확인 중이에요! 🙂"
        : "입금 후 아래 [입금 완료했어요] 버튼을 눌러주세요.",
    },
  ]);
  const [paid, setPaid] = useState(alreadyPaid);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function pushBot(text: string) {
    setMessages((m) => [...m, { id: nextId(), role: "bot", kind: "text", text }]);
  }
  function pushUser(text: string) {
    setMessages((m) => [...m, { id: nextId(), role: "user", kind: "text", text }]);
  }

  async function onPaid() {
    pushUser("입금 완료했어요!");
    if (!paid) {
      setPaid(true);
      const res = await markGroupBuyPaid(gb.slug);
      if (!res.ok) {
        pushBot("앗, 처리 중 문제가 생겼어요. 잠시 후 다시 눌러주세요.");
        setPaid(false);
        return;
      }
      router.refresh();
    }
    setTimeout(
      () =>
        pushBot(
          `입금 확인 중이에요! 입금자명이 닉네임(${nickname})과 다르면 알려주세요.\n확인되면 발송 안내를 드릴게요 🙂`,
        ),
      300,
    );
  }

  function onQuick(key: "ship" | "name" | "cancel") {
    if (key === "ship") {
      pushUser("발송은 언제 오나요?");
      setTimeout(
        () => pushBot(`${gb.shipFrom}.\n목표 인원 달성 후 산지에서 순차 발송돼요!`),
        300,
      );
    } else if (key === "name") {
      pushUser("입금자명이 달라요");
      setTimeout(
        () =>
          pushBot("괜찮아요! 입금하신 분 성함을 이 채팅에 남겨주시면 매칭해 드릴게요."),
        300,
      );
    } else {
      pushUser("참여를 취소하고 싶어요");
      setTimeout(
        () =>
          pushBot("공구 페이지에서 '취소' 버튼으로 참여를 취소할 수 있어요. 아래 버튼을 눌러주세요."),
        300,
      );
    }
  }

  function onSend() {
    const t = input.trim();
    if (!t) return;
    pushUser(t);
    setInput("");
    setTimeout(
      () =>
        pushBot(
          "남겨주신 내용 확인했어요! 운영팀이 순차적으로 확인할게요.\n급한 문의는 아래 버튼을 이용해주세요 🙂",
        ),
      400,
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      {/* 헤더 */}
      <header className="flex items-center gap-2 border-b border-zinc-100 bg-white px-2 py-2">
        <button
          type="button"
          onClick={() => router.push(`/groupbuy/${gb.slug}`)}
          aria-label="뒤로"
          className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-[16px]">
            🤖
          </span>
          <div className="leading-tight">
            <p className="text-[14px] font-bold text-zinc-900">띵동봇</p>
            <p className="text-[11px] text-zinc-400">{gb.title} 공구 안내</p>
          </div>
        </div>
      </header>

      {/* 메시지 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-4 text-center text-[11px] text-zinc-400">
          자동 응답 챗봇이에요. 아래 버튼으로 문의할 수 있어요.
        </p>
        <div className="flex flex-col gap-2.5">
          {messages.map((m) =>
            m.kind === "account" ? (
              <AccountCard
                key={m.id}
                gb={gb}
                amount={amount}
                optionLabel={optionLabel}
                quantity={quantity}
                nickname={nickname}
              />
            ) : (
              <Bubble key={m.id} role={m.role} text={m.text} />
            ),
          )}
          {paid && (
            <div className="mx-auto mt-1 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-600">
              ✓ 입금 완료 알림 보냄 · 확인 중
            </div>
          )}
        </div>
      </div>

      {/* 빠른 질문 + 입력 */}
      <div className="border-t border-zinc-100 bg-white">
        <div className="flex gap-2 overflow-x-auto px-3 pt-2.5 [&::-webkit-scrollbar]:hidden">
          {!paid && (
            <QuickChip label="입금 완료했어요" highlight onClick={onPaid} />
          )}
          <QuickChip label="발송 언제와요?" onClick={() => onQuick("ship")} />
          <QuickChip label="입금자명이 달라요" onClick={() => onQuick("name")} />
          <QuickChip label="참여 취소" onClick={() => onQuick("cancel")} />
          <Link
            href={`/groupbuy/${gb.slug}` as any}
            className="flex shrink-0 items-center rounded-full border border-zinc-200 px-3 py-2 text-[13px] font-medium text-zinc-500 active:bg-zinc-50"
          >
            공구 페이지
          </Link>
        </div>
        <div className="flex items-end gap-2 px-3 pb-2.5 pt-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            maxLength={500}
            placeholder="메시지 입력"
            className="max-h-24 min-h-[44px] flex-1 resize-none rounded-2xl bg-zinc-100 px-4 py-3 text-[15px] text-zinc-800 outline-none placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim()}
            aria-label="전송"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition",
              input.trim() ? "bg-brand text-white active:scale-95" : "bg-zinc-100 text-zinc-300",
            )}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 12l16-8-6 16-3-7-7-1Z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, text }: { role: "bot" | "user"; text: string }) {
  const isBot = role === "bot";
  return (
    <div className={cn("flex", isBot ? "justify-start" : "justify-end")}>
      <p
        className={cn(
          "max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed",
          isBot
            ? "rounded-tl-md bg-white text-zinc-800 shadow-sm"
            : "rounded-tr-md bg-brand text-white",
        )}
      >
        {text}
      </p>
    </div>
  );
}

function AccountCard({
  gb,
  amount,
  optionLabel,
  quantity,
  nickname,
}: {
  gb: GroupBuy;
  amount: number;
  optionLabel: string;
  quantity: number;
  nickname: string;
}) {
  const [copied, setCopied] = useState<"amount" | "account" | null>(null);
  async function copy(kind: "amount" | "account", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1500);
    } catch {
      /* 클립보드 미지원 무시 */
    }
  }
  const acc = gb.bankAccount;
  return (
    <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-white p-4 shadow-sm">
      <p className="text-[13px] font-bold text-zinc-900">💳 입금 정보</p>
      <p className="mt-0.5 text-[12px] text-zinc-400">
        {optionLabel} × {quantity}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[13px] text-zinc-500">입금액</span>
        <div className="flex items-center gap-2">
          <span className="text-[16px] font-extrabold text-zinc-900">
            {formatKrw(amount)}
          </span>
          <CopyBtn
            on={copied === "amount"}
            onClick={() => copy("amount", String(amount))}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[13px] text-zinc-500">계좌</span>
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-zinc-900">
            {acc.bank} {acc.number}
          </span>
          <CopyBtn
            on={copied === "account"}
            onClick={() => copy("account", acc.number)}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[13px] text-zinc-500">예금주</span>
        <span className="text-[14px] font-medium text-zinc-700">{acc.holder}</span>
      </div>

      <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-700">
        입금자명을 <b>{nickname}</b> 으로 보내주시면 확인이 빨라요!
      </div>
    </div>
  );
}

function CopyBtn({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 text-[11px] font-bold transition",
        on ? "bg-emerald-100 text-emerald-600" : "bg-zinc-100 text-zinc-500 active:bg-zinc-200",
      )}
    >
      {on ? "복사됨" : "복사"}
    </button>
  );
}

function QuickChip({
  label,
  onClick,
  highlight,
}: {
  label: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-2 text-[13px] font-semibold transition active:scale-95",
        highlight
          ? "bg-brand text-white"
          : "border border-zinc-200 bg-white text-zinc-600 active:bg-zinc-50",
      )}
    >
      {label}
    </button>
  );
}
