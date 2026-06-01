// 스토어 카드 (프레젠테이션) — 추천 피드·검색 결과 공용.
// "use client" 없음 → 서버/클라이언트 양쪽에서 import 가능.

import { StoreThumb } from "./StoreThumb";

export type StoreCardData = {
  title: string;
  subtitle: string;
  link: string;
  image: string | null;
};

export function StoreCard({ title, subtitle, link, image }: StoreCardData) {
  const inner = (
    <>
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-brand-50">
        {image ? (
          // 외부 이미지(쇼핑) — next/image 도메인 설정 회피 위해 background 로 표시
          <div
            className="h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${image})` }}
            aria-hidden
          />
        ) : (
          <StoreThumb storeName={title} menu={subtitle} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900">{title}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{subtitle}</p>
      </div>
    </>
  );

  const cls = "flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 transition";

  if (link) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className={`${cls} hover:border-brand/40 hover:shadow-sm`}
      >
        {inner}
      </a>
    );
  }
  return <div className={cls}>{inner}</div>;
}
