"use client";

// 닉네임 편집 폼 — updateNickname 서버 액션 호출. 변경 없으면 저장 비활성.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateNickname } from "@/app/_actions/update-profile";

export function ProfileEditForm({ initialNickname }: { initialNickname: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initialNickname);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const trimmed = nickname.trim();
  const dirty = trimmed !== initialNickname;
  const canSave = dirty && trimmed.length >= 2 && !pending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateNickname(nickname);
      if (res.ok) {
        setSaved(true);
        router.refresh(); // UserBar 등 닉네임 갱신
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3">
      <label className="text-[12px] font-medium text-zinc-500">닉네임</label>
      <div className="mt-1 flex items-stretch gap-2">
        <input
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            setSaved(false);
          }}
          maxLength={10}
          placeholder="2~10자 (한글·영문·숫자·_)"
          className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={!canSave}
          className="shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition active:opacity-80 disabled:opacity-40"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[12px] text-rose-500">{error}</p>}
      {saved && !error && (
        <p className="mt-1.5 text-[12px] text-brand">닉네임을 변경했어요.</p>
      )}
    </form>
  );
}
