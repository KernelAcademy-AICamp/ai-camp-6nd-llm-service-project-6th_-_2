"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import {
  AttachActionSheet,
  CameraIcon,
  GalleryIcon,
} from "./attach-action-sheet";

interface Props {
  onSend: (body: string) => Promise<void> | void;
  // 이미지 업로드 핸들러 — 선택된 파일을 받아 업로드+메시지 INSERT까지 처리한다.
  // 영수증 첨부는 입력창에서 제거됨 — ActionBanner의 "영수증 등록" 버튼으로 통합.
  onAttachImage?: (file: File) => Promise<void> | void;
  disabled?: boolean;
  // 채팅이 읽기 전용일 때(완료/취소된 반띵).
  readOnly?: boolean;
  readOnlyHint?: string;
}

const MAX_LEN = 1000;
const RATE_WINDOW_MS = 1000;
const RATE_LIMIT = 5;
const RATE_COOLDOWN_MS = 10_000;

const IMG_MAX_BYTES = 10 * 1024 * 1024;
const IMG_ACCEPT = "image/jpeg,image/png,image/webp";

export function ChatInputBar({
  onSend,
  onAttachImage,
  disabled = false,
  readOnly = false,
  readOnlyHint = "이 반띵은 종료되어 메시지를 보낼 수 없어요.",
}: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const sendTimestampsRef = useRef<number[]>([]);
  // 카메라용(capture=environment) / 갤러리용(capture 없음) 두 input을 분리해
  // 사용자가 "사진 찍기 / 사진 첨부"를 명시적으로 선택할 수 있게 한다.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const trimmed = value.trim();
  const overLimit = value.length > MAX_LEN;
  const canSend = !!trimmed && !overLimit && !sending && !disabled && !readOnly;

  // 쿨다운 종료 시 에러 메시지 자동 제거
  useEffect(() => {
    if (!cooldownUntil) return;
    const ms = cooldownUntil - Date.now();
    if (ms <= 0) {
      setCooldownUntil(0);
      setError(null);
      return;
    }
    const id = setTimeout(() => {
      setCooldownUntil(0);
      setError(null);
    }, ms);
    return () => clearTimeout(id);
  }, [cooldownUntil]);

  function checkRate(): boolean {
    if (cooldownUntil && Date.now() < cooldownUntil) return false;
    const now = Date.now();
    sendTimestampsRef.current = sendTimestampsRef.current.filter(
      (t) => now - t < RATE_WINDOW_MS,
    );
    if (sendTimestampsRef.current.length >= RATE_LIMIT) {
      setCooldownUntil(now + RATE_COOLDOWN_MS);
      setError("잠시 후 다시 시도해주세요.");
      return false;
    }
    sendTimestampsRef.current.push(now);
    return true;
  }

  async function submit() {
    if (!canSend) {
      if (!trimmed && value.length > 0) setError("메시지를 입력해주세요.");
      if (overLimit) setError(`최대 ${MAX_LEN}자까지 입력할 수 있어요.`);
      return;
    }
    if (!checkRate()) return;

    setSending(true);
    setError(null);
    try {
      await onSend(trimmed);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "전송에 실패했어요.");
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

  async function handleImagePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 다시 선택 가능하도록 reset
    if (!file || !onAttachImage) return;
    if (file.size > IMG_MAX_BYTES) {
      setError("10MB 이하의 이미지를 선택해주세요.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("JPG, PNG, WEBP 형식만 업로드할 수 있어요.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await onAttachImage(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했어요.");
    } finally {
      setUploading(false);
    }
  }

  if (readOnly) {
    return (
      <div className="mb-3 border-t border-black/[0.06] bg-gray-50 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <p className="text-center text-[12px] text-gray-500">{readOnlyHint}</p>
      </div>
    );
  }

  const cooldownActive = cooldownUntil > 0 && Date.now() < cooldownUntil;
  const remainingChars = MAX_LEN - value.length;
  const showCounter = value.length > MAX_LEN * 0.9; // 90% 이상일 때만 노출

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-3 border-t border-black/[0.06] bg-white px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2"
    >
      {(error || showCounter) && (
        <div className="mb-1 flex items-center justify-between px-1">
          <span
            className={cn(
              "text-[11px]",
              error ? "text-rose-600" : "text-transparent",
            )}
          >
            {error ?? "."}
          </span>
          {showCounter && (
            <span
              className={cn(
                "text-[11px] tabular-nums",
                overLimit ? "text-rose-600" : "text-gray-400",
              )}
            >
              {value.length}/{MAX_LEN}
            </span>
          )}
        </div>
      )}

      <div
        className={cn(
          "flex items-end gap-2 rounded-3xl bg-gray-100 px-2 py-1.5",
          "focus-within:bg-gray-50 focus-within:ring-2 focus-within:ring-brand/30",
          disabled && "opacity-60",
          overLimit && "ring-2 ring-rose-300",
        )}
      >
        {onAttachImage && (
          <>
            <input
              ref={cameraInputRef}
              type="file"
              accept={IMG_ACCEPT}
              capture="environment"
              onChange={handleImagePick}
              disabled={disabled || uploading}
              className="hidden"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept={IMG_ACCEPT}
              onChange={handleImagePick}
              disabled={disabled || uploading}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => setAttachSheetOpen(true)}
              disabled={disabled || uploading}
              aria-label="사진 첨부"
              title="사진 첨부"
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors active:bg-black/[0.06] disabled:opacity-50"
            >
              {uploading ? (
                <svg width="20" height="20" viewBox="0 0 24 24" className="animate-spin" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" fill="none" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="9" cy="11" r="1.7" stroke="currentColor" strokeWidth="1.8" />
                  <path d="m4 18 5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </>
        )}
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={cooldownActive ? "잠시 후 다시 시도해주세요" : "메시지를 입력하세요"}
          rows={1}
          maxLength={MAX_LEN + 50 /* hard ceiling to allow showing over-limit error */}
          disabled={disabled}
          aria-invalid={overLimit}
          className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-1.5 text-[14px] leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed"
        />

        <button
          type="submit"
          disabled={!canSend}
          aria-label="보내기"
          className={cn(
            "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
            canSend
              ? "bg-brand text-white active:opacity-80"
              : "bg-gray-200 text-gray-400",
          )}
        >
          {sending ? (
            <svg width="18" height="18" viewBox="0 0 24 24" className="animate-spin" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" fill="none" />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 19V5M6 11l6-6 6 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>

      {onAttachImage && (
        <AttachActionSheet
          open={attachSheetOpen}
          onClose={() => setAttachSheetOpen(false)}
          options={[
            {
              key: "camera",
              label: "사진 찍기",
              icon: <CameraIcon />,
              onSelect: () => cameraInputRef.current?.click(),
            },
            {
              key: "gallery",
              label: "사진 첨부",
              icon: <GalleryIcon />,
              onSelect: () => galleryInputRef.current?.click(),
            },
          ]}
        />
      )}
    </form>
  );
}
