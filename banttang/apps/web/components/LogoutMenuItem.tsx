"use client";

// 마이페이지 hub에서 사용하는 로그아웃 메뉴 항목. 클릭 시 확인 모달, 확인 시 로그아웃 처리.

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutMenuItem() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doLogout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 border-t border-zinc-100 px-4 py-3.5 first:border-0 active:bg-zinc-50"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          <LogoutIcon />
        </span>
        <span className="flex-1 text-left text-[14px] font-medium text-zinc-800">
          로그아웃
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[320px] rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h3 className="text-center text-[17px] font-bold text-zinc-900">
              로그아웃 할까요?
            </h3>
            <p className="mt-2 text-center text-[13px] leading-relaxed text-zinc-500">
              다시 이용하려면 로그인해야 해요.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 rounded-xl border border-zinc-200 py-3 text-[14px] font-semibold text-zinc-700 active:bg-zinc-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={doLogout}
                disabled={busy}
                className="flex-1 rounded-xl bg-brand py-3 text-[14px] font-semibold text-white active:opacity-80"
              >
                {busy ? "..." : "로그아웃"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LogoutIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"
        stroke="#71717a"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 17l5-5-5-5M21 12H9"
        stroke="#71717a"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
