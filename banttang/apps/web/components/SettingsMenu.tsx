"use client";

// 마이페이지 설정(톱니바퀴) 드롭다운.
// 현재 항목은 운영자 페이지 진입 — is_admin 사용자에게만 노출.
// 표시할 항목이 없으면(일반 사용자) 클릭해도 열리지 않는다.

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";

export function SettingsMenu({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const hasItems = isAdmin; // 항목이 늘면 조건 확장

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="설정"
        aria-expanded={open}
        onClick={() => hasItems && setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 active:bg-zinc-100"
      >
        <SettingsIcon />
      </button>

      {open && hasItems && (
        <>
          {/* 바깥 클릭으로 닫기 */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-10 z-50 min-w-[160px] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            {isAdmin && (
              <Link
                href={"/admin" as Route}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-[14px] font-medium text-zinc-800 active:bg-zinc-50"
              >
                <span aria-hidden>🛠</span> 운영자 페이지
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}
