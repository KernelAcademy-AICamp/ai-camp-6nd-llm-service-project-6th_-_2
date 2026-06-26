"use client";

// 회원 상세 — 운영 액션(⋯ 드롭다운): 제재 · 운영자 · 봇. requireAdmin은 서버 액션에서 2차 검증.
//   docs/admin-user-management.md §9 Phase 2·3

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adminSuspendUser,
  adminUnsuspendUser,
  adminSetBot,
  adminSetAdmin,
} from "@/app/_actions/admin-users";

type Result = { ok: true } | { ok: false; error: string };

export function MemberActions({
  userId,
  isAdmin,
  isBot,
  suspended,
}: {
  userId: string;
  isAdmin: boolean;
  isBot: boolean;
  suspended: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<Result>) => {
    setError(null);
    setOpen(false);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const item = "flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14px] font-medium hover:bg-brand-50/50 active:bg-brand-50";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="옵션"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-zinc-400 active:bg-zinc-100 disabled:opacity-50"
      >
        {pending ? "…" : "⋮"}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-9 z-50 min-w-[160px] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            {suspended ? (
              <button className={`${item} text-emerald-700`} onClick={() => run(() => adminUnsuspendUser(userId))}>
                <span aria-hidden>✅</span> 제재 해제
              </button>
            ) : (
              <button className={`${item} text-red-600`} onClick={() => run(() => adminSuspendUser(userId))}>
                <span aria-hidden>🚫</span> 계정 제재
              </button>
            )}
            <button className={`${item} text-zinc-800`} onClick={() => run(() => adminSetAdmin(userId, !isAdmin))}>
              <span aria-hidden>🛡️</span> {isAdmin ? "운영자 해제" : "운영자 지정"}
            </button>
            <button className={`${item} text-zinc-800`} onClick={() => run(() => adminSetBot(userId, !isBot))}>
              <span aria-hidden>🤖</span> {isBot ? "봇 해제" : "봇으로 표시"}
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="absolute right-0 top-9 z-50 whitespace-nowrap rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-600 shadow">
          {error}
        </p>
      )}
    </div>
  );
}
