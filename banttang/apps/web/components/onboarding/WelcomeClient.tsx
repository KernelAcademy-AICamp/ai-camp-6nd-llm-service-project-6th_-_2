"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// 거주지 등록 직후 노출되는 환영/CTA 페이지.
// "같은 건물 사람들과 띵동을 등록해 보세요" 라는 메시지로 첫 호스팅 진입을 유도.
export function WelcomeClient({ address }: { address: string | null }) {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-zinc-50 px-5 py-10">
      <header className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand/15 text-[44px]">
          🏢
        </div>
        <h1 className="mt-6 text-[22px] font-extrabold leading-snug tracking-tight text-zinc-900">
          같은 건물 내 사람들과
          <br />
          띵동을 등록해 보세요
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
          같은 건물에 사는 이웃과 함께
          <br />
          더 합리적인 가격으로 반띵해요.
        </p>

        {address && (
          <div className="mt-6 inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[12px]">
            <span aria-hidden>📍</span>
            <span className="truncate font-semibold text-zinc-700">
              {address}
            </span>
          </div>
        )}
      </header>

      <div className="flex flex-col gap-2 pb-6">
        <Link
          href="/host/new"
          className="flex h-12 w-full items-center justify-center rounded-xl bg-brand text-[14px] font-bold text-white shadow-sm active:opacity-90"
        >
          반띵 등록하기
        </Link>
        <button
          type="button"
          onClick={() => router.replace("/feed")}
          className="h-12 w-full rounded-xl border border-zinc-200 bg-white text-[14px] font-semibold text-zinc-700 active:bg-zinc-50"
        >
          먼저 둘러볼게요
        </button>
      </div>
    </main>
  );
}
