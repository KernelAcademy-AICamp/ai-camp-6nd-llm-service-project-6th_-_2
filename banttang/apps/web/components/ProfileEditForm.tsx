"use client";

// 프로필 편집 — 닉네임 + 거주지(건물명). 변경된 항목만 저장.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateNickname } from "@/app/_actions/update-profile";

export function ProfileEditForm({
  initialNickname,
  initialResidence = "",
}: {
  initialNickname: string;
  initialResidence?: string;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initialNickname);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const trimmedNick = nickname.trim();
  const nickDirty = trimmedNick !== initialNickname;
  const canSave = nickDirty && trimmedNick.length >= 2 && !pending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      if (nickDirty) {
        const res = await updateNickname(nickname);
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-4">
      <div>
        <label className="text-[12px] font-medium text-zinc-500">닉네임</label>
        <input
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            setSaved(false);
          }}
          maxLength={10}
          placeholder="2~10자 (한글·영문·숫자·_)"
          className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={!canSave}
        className="rounded-xl bg-brand py-2.5 text-sm font-semibold text-white transition active:opacity-80 disabled:opacity-40"
      >
        {pending ? "저장 중…" : "저장"}
      </button>

      {error && <p className="text-[12px] text-rose-500">{error}</p>}
      {saved && !error && (
        <p className="text-[12px] text-brand">프로필을 저장했어요.</p>
      )}
    </form>
  );
}
