"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  // 호스트가 영수증을 제출. 호출자가 파일을 받아 검증 파이프라인을 트리거한다.
  // 금액은 사용자 입력 X — LLM이 추출 (정책: receipt-amount-auto-extract).
  onSubmit: (input: { file: File }) => Promise<void>;
}

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic"];

// 명세서 3장 — 영수증/주문 내역 인증.
// 호스트가 사진만 제출 → server action이 Claude Vision으로 금액·가게·일시 추출 + 검증.
export function ReceiptSheet({ open, onClose, onSubmit }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      // 닫힐 때 정리 (preview URL revoke)
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl(null);
      setError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError("사진 파일(JPG, PNG)로 올려주세요.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("사진이 너무 커요. 8MB 이하로 다시 올려주세요.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function handleClearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const canSubmit = !!file && !submitting;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) {
      if (!file) setError("영수증 사진을 먼저 올려주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ file: file! });
      onClose();
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onClose={handleClose} title="영수증 인증" maxHeightPct={92}>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="flex flex-col gap-5 p-4 pb-6">
          <div>
            <p className="text-[15px] font-bold text-gray-900">
              주문 내역 사진을 올려주세요
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-gray-500">
              사진 한 장만 올리면 가게랑 금액을 자동으로 확인해드려요.
              <br />
              가게 이름, 결제 금액, 결제 시각이 잘 보이게 찍어주세요.
            </p>
          </div>

          {/* 1. 사진 영역 */}
          <section>
            <p className="mb-2 text-[13px] font-bold text-gray-900">영수증 사진</p>

            {!previewUrl ? (
              <label className="flex h-44 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 transition-colors active:bg-gray-100">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED.join(",")}
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand ring-1 ring-brand/30">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="text-[14px] font-semibold text-gray-700">
                  사진 올리기
                </span>
                <span className="text-[11px] text-gray-400">8MB 이하의 사진</span>
              </label>
            ) : (
              <div className="relative overflow-hidden rounded-2xl ring-1 ring-black/[0.06]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="영수증 미리보기"
                  className="block max-h-72 w-full object-contain bg-gray-50"
                />
                <button
                  type="button"
                  onClick={handleClearFile}
                  aria-label="사진 제거"
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-opacity active:opacity-80"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M6 6l12 12M18 6 6 18"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            )}
          </section>

          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-[12px] font-medium text-rose-700">
              {error}
            </p>
          )}
        </div>

        {/* sticky 제출 버튼 영역 */}
        <div className="sticky bottom-0 flex gap-2 border-t border-black/[0.06] bg-white px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="h-12 flex-1 rounded-xl bg-gray-100 text-[15px] font-semibold text-gray-700 transition-colors active:bg-gray-200 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "h-12 flex-[2] rounded-xl text-[15px] font-bold transition-opacity",
              canSubmit
                ? "bg-brand text-white active:opacity-80"
                : "bg-gray-200 text-gray-400",
            )}
          >
            {submitting ? "확인하는 중..." : "채팅방에 올리기"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// 에러를 사용자가 알 수 있는 문구로 번역.
// - Failed to fetch / NetworkError → 서버 연결 실패 (FastAPI 미가동 등)
// - 한글로 응답된 FastAPI detail → 그대로 사용 (예: "영수증을 인증하지 못했어요.")
// - 그 외 영어/디버그 메시지 → 일반 안내
function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (!msg) return "지금은 등록할 수 없어요. 잠시 후 다시 시도해주세요.";
  if (/failed to fetch|networkerror|load failed|aborted|timeout/i.test(msg)) {
    return "서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.";
  }
  // 한글이 포함된 메시지(=서버 사람-친화 응답)는 그대로 노출
  if (/[가-힣]/.test(msg)) return msg;
  // 영문 디버그 메시지는 일반 안내로 대체
  return "지금은 등록할 수 없어요. 잠시 후 다시 시도해주세요.";
}
