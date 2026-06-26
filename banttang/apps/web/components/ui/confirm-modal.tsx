"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useConfirmStore } from "@/lib/confirm";
import { cn } from "@/lib/utils";

const EXIT_MS = 180;

export function ConfirmModal() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const respond = useConfirmStore((s) => s.respond);

  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setShown(true);
      // 다음 프레임에 visible로 전환해 enter 애니메이션 트리거
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
      if (e.key === "Escape") {
        e.preventDefault();
        respond(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        respond(true);
      }
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, respond]);

  if (!mounted || !shown || !options) return null;

  const {
    title,
    description,
    confirmText = "확인",
    cancelText = "취소",
    destructive = false,
    infoOnly = false,
    confirmFirst = false,
  } = options;

  const cancelBtn = !infoOnly ? (
    <button
      key="cancel"
      type="button"
      onClick={() => respond(false)}
      className="flex-1 h-12 rounded-xl bg-gray-100 text-[15px] font-semibold text-gray-700 transition-colors active:bg-gray-200"
    >
      {cancelText}
    </button>
  ) : null;

  const confirmBtn = (
    <button
      key="confirm"
      type="button"
      autoFocus
      onClick={() => respond(true)}
      className={cn(
        "h-12 rounded-xl text-[15px] font-semibold text-white transition-colors",
        infoOnly ? "w-full" : "flex-1",
        destructive
          ? "bg-[#ef4444] active:bg-[#dc2626]"
          : "bg-brand active:brightness-95",
      )}
    >
      {confirmText}
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-5"
      role="presentation"
      onClick={() => respond(false)}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/40 transition-opacity",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDuration: `${EXIT_MS}ms` }}
      />

      {/* Card */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={description ? "confirm-modal-desc" : undefined}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-[340px] rounded-[20px] bg-white p-6 shadow-2xl",
          "transition-all ease-out",
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.97] opacity-0",
        )}
        style={{ transitionDuration: `${EXIT_MS}ms` }}
      >
        <h2
          id="confirm-modal-title"
          className="text-[17px] font-bold leading-snug text-gray-900"
        >
          {title}
        </h2>
        {description && (
          <p
            id="confirm-modal-desc"
            className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-gray-500"
          >
            {description}
          </p>
        )}

        <div className="mt-6 flex gap-2">
          {confirmFirst ? (
            <>
              {confirmBtn}
              {cancelBtn}
            </>
          ) : (
            <>
              {cancelBtn}
              {confirmBtn}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
