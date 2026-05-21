"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onClose: () => void;
  // 호스트가 영수증을 제출. 호출자가 파일을 받아 검증 파이프라인을 트리거한다.
  onSubmit: (input: { file: File; totalAmount: number }) => Promise<void>;
}

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export function ReceiptSheet({ open, onClose, onSubmit }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setAmount("");
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError("JPG, PNG, WEBP, HEIC만 업로드 가능해요.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("파일 크기는 8MB 이하여야 해요.");
      return;
    }
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const total = Number(amount.replace(/[^0-9]/g, ""));
    if (!total || total <= 0) {
      setError("금액을 정확히 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ file, totalAmount: total });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "검증 요청에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onClose={handleClose} title="영수증 인증">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
        <p className="text-xs text-foreground/60">
          AI가 자동으로 가게·금액을 인식해요. 상호, 결제 금액, 결제 일시가 또렷이
          보이도록 촬영해주세요.
        </p>

        <label className="block">
          <span className="text-sm font-medium">영수증 사진</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            onChange={handleFileChange}
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-foreground/5 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-foreground/10"
          />
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="영수증 미리보기"
              className="mt-3 max-h-72 w-full rounded-md border border-foreground/10 object-contain"
            />
          )}
        </label>

        <label className="block">
          <span className="text-sm font-medium">총 결제 금액</span>
          <Input
            inputMode="numeric"
            placeholder="예: 24800"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-2"
          />
          <p className="mt-1 text-xs text-foreground/60">
            영수증과 동일한 금액을 원 단위로 입력해주세요.
          </p>
        </label>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-900">{error}</p>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={submitting}
            className="flex-1"
          >
            취소
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={!file || !amount || submitting}
            className="flex-1"
          >
            {submitting ? "검증 요청 중..." : "채팅방에 공유"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
