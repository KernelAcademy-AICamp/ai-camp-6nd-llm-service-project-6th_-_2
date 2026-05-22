"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface ActionOption {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  options: ActionOption[];
}

const EXIT_MS = 200;

// 카톡/당근 스타일 바텀 액션 시트.
// "사진 찍기 / 사진 첨부" 같은 첨부 진입점을 모바일에서 친숙한 UI로 노출.
export function AttachActionSheet({ open, onClose, options }: Props) {
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
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

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-md bg-transparent transition-transform ease-out",
          visible ? "translate-y-0" : "translate-y-full",
        )}
        style={{ transitionDuration: `${EXIT_MS}ms` }}
      >
        {/* Options card */}
        <div className="mx-3 mb-2 overflow-hidden rounded-2xl bg-white shadow-2xl">
          {options.map((opt, i) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                opt.onSelect();
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-3 px-5 py-4 text-left transition-colors active:bg-gray-50",
                i < options.length - 1 && "border-b border-black/[0.05]",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700">
                {opt.icon}
              </span>
              <span className="text-[15px] font-semibold text-gray-900">
                {opt.label}
              </span>
            </button>
          ))}
        </div>

        {/* Cancel button — iOS 액션 시트 패턴 */}
        <div className="mx-3 mb-[max(env(safe-area-inset-bottom),0.75rem)] overflow-hidden rounded-2xl bg-white shadow-2xl">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-5 py-4 text-[15px] font-bold text-gray-900 transition-colors active:bg-gray-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// 흔히 쓰이는 아이콘 — 동일 톤 유지
export function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8h3l2-2h6l2 2h3v11H4V8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function GalleryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="11" r="1.7" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m4 18 5-5 4 4 3-3 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
