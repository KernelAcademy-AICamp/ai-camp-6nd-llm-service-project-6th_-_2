"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/types/domain";

interface Props {
  open: boolean;
  onClose: () => void;
  members: Pick<UserProfile, "id" | "nickname">[];
  // 호스트가 멤버 선택 시 호출 — 컨테이너에서 askConfirm 후 실제 강퇴 처리.
  onSelect: (memberId: string) => void;
  disabled?: boolean;
}

const EXIT_MS = 200;

// 호스트가 내보낼 파티원을 고르는 바텀시트 — 카톡/당근의 멤버 관리 패턴.
// 아바타 + 닉네임 + 우측 화살표로 1탭에 선택 → 컨테이너의 confirm 모달로 이어진다.
export function MemberKickSheet({
  open,
  onClose,
  members,
  onSelect,
  disabled = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setShown(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const t = setTimeout(() => setShown(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted || !shown) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center"
      role="presentation"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDuration: `${EXIT_MS}ms` }}
      />

      {/* Sheet card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="파티원 내보내기"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-md transition-transform ease-out",
          visible ? "translate-y-0" : "translate-y-full",
        )}
        style={{ transitionDuration: `${EXIT_MS}ms` }}
      >
        <div className="mx-3 mb-[max(env(safe-area-inset-bottom),0.75rem)] overflow-hidden rounded-2xl bg-white shadow-2xl">
          {/* Handle bar — 모바일 시트 어포던스 */}
          <div className="flex justify-center pt-2.5">
            <span className="h-1 w-9 rounded-full bg-gray-200" aria-hidden />
          </div>

          {/* Header */}
          <div className="px-5 pt-3 pb-2">
            <h2 className="text-[16px] font-bold text-gray-900">
              파티원 내보내기
            </h2>
            <p className="mt-0.5 text-[12px] text-gray-500">
              내보낼 파티원을 선택하세요. 내보낸 후엔 다시 참여 요청을 받아야 합니다.
            </p>
          </div>

          {/* Member list */}
          <ul className="max-h-[50vh] overflow-y-auto">
            {members.length === 0 ? (
              <li className="px-5 py-6 text-center text-[13px] text-gray-400">
                내보낼 수 있는 파티원이 없어요.
              </li>
            ) : (
              members.map((m, i) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(m.id);
                      onClose();
                    }}
                    disabled={disabled}
                    className={cn(
                      "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors active:bg-gray-50",
                      "disabled:opacity-50",
                      i > 0 && "border-t border-black/[0.05]",
                    )}
                  >
                    <Avatar nickname={m.nickname} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-gray-900">
                        {m.nickname}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-rose-50 px-3 py-1 text-[12px] font-bold text-rose-600">
                      내보내기
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          {/* Cancel */}
          <div className="border-t border-black/[0.05]">
            <button
              type="button"
              onClick={onClose}
              className="w-full px-5 py-3.5 text-[14px] font-semibold text-gray-700 transition-colors active:bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
