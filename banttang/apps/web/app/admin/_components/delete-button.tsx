"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adminDeleteParty,
  adminDeleteCommunityPost,
  adminDeleteCommunityComment,
} from "@/app/_actions/admin";

type Kind = "party" | "post" | "comment";

const ACTIONS: Record<Kind, (id: string) => Promise<{ ok: true } | { ok: false; error: string }>> =
  {
    party: adminDeleteParty,
    post: adminDeleteCommunityPost,
    comment: adminDeleteCommunityComment,
  };

// 운영자 삭제 버튼. confirm 후 서버 액션 호출.
// redirectTo가 있으면 삭제 성공 시 해당 경로로 이동(상세→목록), 없으면 router.refresh().
export function AdminDeleteButton({
  kind,
  id,
  label = "삭제",
  confirmText = "정말 삭제할까요? 되돌릴 수 없어요.",
  redirectTo,
  size = "md",
}: {
  kind: Kind;
  id: string;
  label?: string;
  confirmText?: string;
  redirectTo?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(confirmText)) return;
    setErr(null);
    startTransition(async () => {
      const res = await ACTIONS[kind](id);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      if (redirectTo) router.push(redirectTo as any);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={
          "rounded-lg font-semibold text-red-600 transition-colors active:bg-red-50 disabled:opacity-50 " +
          (size === "sm" ? "px-2 py-0.5 text-[11px]" : "border border-red-200 px-3 py-1.5 text-[13px]")
        }
      >
        {pending ? "삭제 중…" : label}
      </button>
      {err && <span className="text-[11px] text-red-500">{err}</span>}
    </span>
  );
}
