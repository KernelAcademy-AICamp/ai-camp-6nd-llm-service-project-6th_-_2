// 스토어 — 추후 채워질 placeholder.
// 청년몽땅정보통 등 혜택/쿠폰 콘텐츠가 들어올 자리. 현재는 안내만.

export const dynamic = "force-dynamic";

export default function StorePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-3 text-4xl" aria-hidden>
        🛍️
      </span>
      <h1 className="text-lg font-bold text-zinc-900">스토어</h1>
      <p className="mt-2 text-sm text-zinc-500">
        혜택·쿠폰·청년 지원 정보를 모아 보여드릴 공간이에요.
        <br />
        곧 만나요!
      </p>
    </main>
  );
}
