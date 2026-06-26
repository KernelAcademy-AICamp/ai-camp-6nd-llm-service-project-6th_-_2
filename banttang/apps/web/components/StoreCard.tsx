// 스토어 카드 (프레젠테이션) — 추천 피드·검색 결과 공용.
// 카드 클릭은 같은 창(앱/웹뷰)에서 이동. iframe 오버레이는 네이버가 서드파티 쿠키·프레이밍을
// 막아 "쿠키를 사용할 수 없습니다"가 떠서 쓰지 않는다.

import Link from "next/link";
import { StoreThumb } from "./StoreThumb";
import { LikeButton } from "./LikeButton";

export type StoreCardData = {
  title: string;
  subtitle: string;
  link: string;
  image: string | null;
  // 지정 시 카드 우측에 "반띵" 버튼 노출 → 해당 경로로 이동(모집글 생성 등).
  // 배달 목록 카드에서 사용.
  banttangHref?: string;
  // 찜 저장 종류 — 음식점/주변마켓=store, 쇼핑=product. 지정하면 하트가 영구 저장됨.
  favoriteKind?: "store" | "product";
  // 이미 찜한 항목이면 하트 채워서 시작.
  initialFavorited?: boolean;
  // AI 추천 이유 — 지정 시 설명 아래 강조 한 줄로 표시.
  reason?: string;
};

export function StoreCard({
  title,
  subtitle,
  link,
  image,
  banttangHref,
  favoriteKind,
  initialFavorited,
  reason,
}: StoreCardData) {
  // 세로 카드 — 사진(위) + 설명(아래). 추천 레일·검색 결과·섹션 리스트 공용.
  const inner = (
    <>
      {/* 사진 — 카드 폭 전체, 4:3 비율 */}
      <div className="aspect-[4/3] w-full overflow-hidden bg-brand-50">
        {image ? (
          // 외부 이미지 — next/image 도메인 설정 회피 위해 <img> 직접 사용.
          // referrerPolicy="no-referrer": 루리웹 등 Referer 핫링크 차단(403) 우회.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <StoreThumb storeName={title} menu={subtitle} />
        )}
      </div>
      {/* 설명 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900">{title}</h3>
        <p className="line-clamp-2 text-xs text-zinc-500">{subtitle}</p>
        {reason && (
          // AI 추천 이유 — 라벨 + 강조 박스로 "왜 추천했는지" 명확히.
          <div className="mt-1.5 rounded-lg bg-brand-50 px-2 py-1.5">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-brand">
              <span aria-hidden>✨</span> 추천 이유
            </p>
            <p className="mt-0.5 text-[11px] font-medium leading-snug text-brand-dark">
              {reason}
            </p>
          </div>
        )}
      </div>
    </>
  );

  // 본문(사진+설명) — 외부 링크가 있으면 a, 없으면 div.
  // 새 탭에서 열기 → 네이버가 최상위 창으로 떠 쿠키가 1st-party 로 정상 동작.
  const body = link ? (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-0 flex-1 flex-col"
    >
      {inner}
    </a>
  ) : (
    <div className="flex min-w-0 flex-1 flex-col">{inner}</div>
  );

  // 반띵 버튼은 본문 링크와 "형제"로 둔다 (a 안에 a/button 중첩 방지).
  // 사진 우측 상단에 작은 원형 아이콘 버튼으로 오버레이.
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:border-brand/40 hover:shadow-sm">
      {body}
      {/* 찜(하트) — 사진 좌측 상단. favoriteKind 있으면 마이페이지 찜 목록에 영구 저장. */}
      <LikeButton
        className="absolute left-2 top-2"
        favorite={
          link && favoriteKind
            ? { kind: favoriteKind, title, subtitle, link, image }
            : null
        }
        initialLiked={initialFavorited}
      />
      {banttangHref && (
        <Link
          href={banttangHref as never}
          aria-label="반띵하기"
          title="반띵하기"
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white shadow-md transition-opacity active:opacity-80"
        >
          {/* 반띵 모집 만들기 — 가게명 프리필 */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      )}
    </div>
  );
}
