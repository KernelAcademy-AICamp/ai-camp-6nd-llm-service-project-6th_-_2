"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  createCommunityPost,
  uploadCommunityPhoto,
} from "@/app/_actions/community";
import { COMMUNITY_CATEGORIES, type CommunityCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_IMAGES = 5;
const MAX_BODY = 2000;

type Uploaded = { path: string; url: string };

export function CommunityWriteClient({
  neighborhoodName,
}: {
  neighborhoodName: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<CommunityCategory>("free");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<Uploaded[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!title.trim() && !!body.trim() && !submitting && !uploading;

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setError(`사진은 최대 ${MAX_IMAGES}장까지 올릴 수 있어요.`);
      return;
    }
    setError(null);
    setUploading(true);
    try {
      for (const file of files.slice(0, room)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await uploadCommunityPhoto(fd);
        if (!res.ok) {
          setError(res.error);
          break;
        }
        setImages((prev) => [
          ...prev,
          { path: res.data.storage_path, url: res.data.public_url },
        ]);
      }
    } finally {
      setUploading(false);
    }
  }

  function removeImage(path: string) {
    setImages((prev) => prev.filter((i) => i.path !== path));
  }

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const res = await createCommunityPost({
      category,
      title,
      body,
      imagePaths: images.map((i) => i.path),
    });
    if (!res.ok) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    router.replace(`/community/${res.data.id}` as any);
  }

  return (
    <div className="flex flex-1 flex-col bg-white">
      {/* 헤더 */}
      <header className="flex items-center justify-between border-b border-zinc-100 px-2 py-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="닫기"
          className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="text-[16px] font-bold text-zinc-900">글쓰기</h1>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={cn(
            "min-w-[56px] rounded-full px-4 py-2.5 text-[15px] font-bold transition",
            canSubmit ? "text-brand active:scale-95" : "text-zinc-300",
          )}
        >
          {submitting ? "올리는 중" : "등록"}
        </button>
      </header>

      {/* 스크롤 영역 */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {/* 카테고리 */}
        <div>
          <p className="mb-2.5 text-[14px] font-bold text-zinc-800">
            어떤 이야기인가요?
          </p>
          <div className="flex flex-wrap gap-2">
            {COMMUNITY_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={cn(
                  "rounded-full px-4 py-2.5 text-[14px] font-semibold transition",
                  category === c.value
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 bg-white text-zinc-500 active:bg-zinc-50",
                )}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 제목 */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="제목을 입력해주세요"
          className="w-full rounded-xl border border-zinc-200 px-4 py-3.5 text-[16px] font-bold text-zinc-900 outline-none transition focus:border-brand placeholder:font-medium placeholder:text-zinc-300"
        />

        {/* 가이드 박스 */}
        <div className="rounded-2xl bg-brand-50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[14px] font-bold text-brand-dark">
            <span className="rounded bg-brand px-1.5 py-0.5 text-[11px] text-white">
              TIP
            </span>
            이웃과 이런 이야기를 나눠보세요
          </p>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-zinc-600">
            <li>· 우리 동네 맛집·생활 정보를 공유해요</li>
            <li>· 같이 살 사람을 구하거나 나눔을 제안해요</li>
            <li>· 운영정책에 어긋나는 글은 삭제될 수 있어요</li>
          </ul>
        </div>

        {/* 본문 */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          rows={8}
          placeholder={`${neighborhoodName ?? "우리 동네"} 이웃과 나누고 싶은 이야기를 적어보세요 😊`}
          className="min-h-[180px] w-full resize-none text-[16px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-300"
        />

        {/* 이미지 미리보기 */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((img) => (
              <div
                key={img.path}
                className="relative h-24 w-24 overflow-hidden rounded-xl bg-zinc-100"
              >
                <Image src={img.url} alt="" fill sizes="96px" className="object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(img.path)}
                  aria-label="삭제"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-[14px] font-medium text-rose-500">{error}</p>}
      </div>

      {/* 하단 툴바 — 탭 메뉴(BottomNav)와 겹치지 않게 아래 여백 */}
      <div className="mb-3 flex items-center gap-3 border-t border-zinc-100 px-4 py-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={onPickFiles}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || images.length >= MAX_IMAGES}
          className="flex h-11 items-center gap-2 rounded-full bg-zinc-100 px-4 text-[14px] font-semibold text-zinc-600 active:bg-zinc-200 disabled:opacity-40"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
            <path d="M5 17l4.5-4 3 2.5L16 12l3 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {uploading ? "올리는 중" : "사진"}
          <span className="text-zinc-400">{images.length}/{MAX_IMAGES}</span>
        </button>
        <span className="ml-auto text-[13px] text-zinc-400">
          {body.length}/{MAX_BODY}
        </span>
      </div>
    </div>
  );
}
