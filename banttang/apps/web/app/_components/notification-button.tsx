"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  approveParticipant,
  rejectParticipant,
} from "@/app/_actions/participant-decision";
import type { PendingItem } from "../page";

interface Props {
  pendingItems: PendingItem[];
}

const EXIT_MS = 200;

// 알림함 — 호스트가 자기 파티들의 pending 신청을 한 곳에서 보고 승인/거절.
export function NotificationButton({ pendingItems }: Props) {
  const [open, setOpen] = useState(false);
  const count = pendingItems.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={count > 0 ? `알림 ${count}건` : "알림"}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-gray-700 transition-colors active:bg-black/[0.04]"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 8a6 6 0 0 1 12 0c0 4 2 5 2 7H4c0-2 2-3 2-7Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M10 19a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        {count > 0 && (
          <span className="absolute right-2 top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      <NotificationSheet
        open={open}
        onClose={() => setOpen(false)}
        items={pendingItems}
      />
    </>
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  items: PendingItem[];
}

function NotificationSheet({ open, onClose, items }: SheetProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function handleApprove(item: PendingItem) {
    if (busyId) return;
    setBusyId(item.participantId);
    try {
      const res = await approveParticipant(item.participantId);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      alert(`승인 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(item: PendingItem) {
    if (busyId) return;
    setBusyId(item.participantId);
    try {
      const res = await rejectParticipant(item.participantId);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      alert(`거절 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyId(null);
    }
  }

  if (!mounted || !shown) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDuration: `${EXIT_MS}ms` }}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="알림함"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl",
          "transition-transform ease-out",
          visible ? "translate-y-0" : "translate-y-full sm:translate-y-4",
        )}
        style={{ transitionDuration: `${EXIT_MS}ms`, maxHeight: "85vh" }}
      >
        <header className="flex items-center justify-between border-b border-black/[0.06] bg-white px-4 py-3.5">
          <p className="text-[15px] font-bold text-gray-900">
            알림함
            {items.length > 0 && (
              <span className="ml-1.5 text-[13px] font-bold text-brand">
                {items.length}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors active:bg-black/[0.05]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-10 text-center">
              <span className="text-[14px] font-medium text-gray-700">
                새 알림이 없어요
              </span>
              <span className="text-[12px] text-gray-400">
                참여 신청이 오면 여기서 확인할 수 있어요.
              </span>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li
                  key={item.participantId}
                  className="rounded-2xl bg-gray-50 p-3 ring-1 ring-black/[0.04]"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar nickname={item.applicantNickname} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-gray-900">
                        {item.applicantNickname}
                        <span className="ml-1 text-[12px] font-normal text-gray-500">
                          님이 참여 신청
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-gray-500">
                        {item.storeName}
                        {item.representativeMenu && (
                          <span className="text-gray-400">
                            {" · "}
                            {item.representativeMenu}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleReject(item)}
                      disabled={busyId === item.participantId}
                      className="h-9 flex-1 rounded-xl bg-white text-[13px] font-bold text-gray-700 ring-1 ring-black/10 transition-colors active:bg-gray-100 disabled:opacity-50"
                    >
                      거절
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(item)}
                      disabled={busyId === item.participantId}
                      className="h-9 flex-[2] rounded-xl bg-brand text-[13px] font-bold text-white transition-opacity active:opacity-80 disabled:opacity-50"
                    >
                      {busyId === item.participantId ? "처리 중…" : "승인"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
