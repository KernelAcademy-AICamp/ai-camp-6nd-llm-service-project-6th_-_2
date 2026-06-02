// 스토어 카드 (프레젠테이션) — 추천 피드·검색 결과 공용.
// "use client" 없음 → 서버/클라이언트 양쪽에서 import 가능.

import Link from "next/link";
import { StoreThumb } from "./StoreThumb";

export type StoreCardData = {
  title: string;
  subtitle: string;
  link: string;
  image: string | null;
  // 지정 시 카드 우측에 "반띵" 버튼 노출 → 해당 경로로 이동(모집글 생성 등).
  // 배달 목록 카드에서 사용.
  banttangHref?: string;
};

export function StoreCard({ title, subtitle, link, image, banttangHref }: StoreCardData) {
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

  // 본문(썸네일+텍스트) — 외부 링크가 있으면 a, 없으면 div. 패딩은 본문이 가진다.
  const body = link ? (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-0 flex-1 items-center gap-3 p-3"
    >
      {inner}
    </a>
  ) : (
    <div className="flex min-w-0 flex-1 items-center gap-3 p-3">{inner}</div>
  );

  // 반띵 버튼은 본문 링크와 "형제"로 둔다 (a 안에 a/button 중첩 방지).
  // 컨테이너는 패딩 없이 overflow-hidden + items-stretch → 버튼이 우측 면을
  // 여백 없이 위아래로 꽉 채우고, 둥근 모서리에 맞게 잘린다.
  return (
    <div className="flex items-stretch overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:border-brand/40 hover:shadow-sm">
      {body}
      {banttangHref && (
        <Link
          href={banttangHref as never}
          className="flex shrink-0 items-center bg-brand px-5 text-[13px] font-bold text-white transition-opacity active:opacity-80"
        >
          반띵
        </Link>
      )}
    </div>
  );
}
