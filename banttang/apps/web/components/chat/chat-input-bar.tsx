"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  onSend: (body: string) => Promise<void> | void;
  // 호스트일 때만 영수증 등록 버튼이 노출됨.
  onAttachReceipt?: () => void;
  disabled?: boolean;
}

export function ChatInputBar({ onSend, onAttachReceipt, disabled = false }: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setValue("");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await submit();
  }

  async function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      await submit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-foreground/10 bg-background px-3 py-2"
    >
      {onAttachReceipt && (
        <button
          type="button"
          onClick={onAttachReceipt}
          disabled={disabled}
          aria-label="영수증 등록"
          title="영수증 등록 (호스트)"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground/5 text-base hover:bg-foreground/10 disabled:opacity-50"
        >
          🧾
        </button>
      )}
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="메시지를 입력하세요"
        rows={1}
        maxLength={2000}
        disabled={disabled}
        className="max-h-32 min-h-[40px] flex-1 resize-none rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50"
      />
      <Button type="submit" disabled={!value.trim() || sending || disabled}>
        {sending ? "전송 중" : "보내기"}
      </Button>
    </form>
  );
}
