-- ----------------------------------------------------------------------------
-- profiles 온보딩 맞춤 추천 선호도 컬럼
-- ----------------------------------------------------------------------------
-- 온보딩 챗봇(steps.ts)에서 수집하는 선택을 저장한다.
--   - primary_usage       : 주 사용 거래 유형 (단일 선택, nullable)
--   - favorite_malls       : 자주 가는 몰 (steps.ts value 그대로, 예: 'traders','baemin')
--   - favorite_categories  : 관심 품목 (steps.ts value 그대로, 예: 'meat','coffee','tissue')
--
-- 정책: 추천 개인화는 동네 단위 베이스 피드(ALL_INTERESTS superset)를
--       "읽는 시점에 재정렬"하는 방식이라, 이 컬럼은 표시단 가중치에만 쓰인다.
--       (search_cache 키/구조는 변경 없음 — 비용·캐시 공유 유지)
-- allowOther=true 자유 입력이 들어올 수 있어 enum 대신 text[] 사용.

create type primary_usage_type as enum (
    'delivery_bulk',  -- 배달 — 같은 상품 나눠요
    'delivery_min',   -- 배달 — 각자 상품 담아요
    'shopping_bulk',  -- 장보기 — 같은 상품 나눠요
    'shopping_min'    -- 장보기 — 각자 상품 담아요
);

alter table profiles
    add column primary_usage       primary_usage_type,
    add column favorite_malls      text[] not null default '{}',
    add column favorite_categories text[] not null default '{}';

comment on column profiles.primary_usage       is '온보딩: 주 사용 거래 유형. 스토어 기본 강조 섹션 결정.';
comment on column profiles.favorite_malls      is '온보딩: 자주 가는 몰 value 배열 (현재 저장만, 광고 정렬은 추후).';
comment on column profiles.favorite_categories is '온보딩: 관심 품목 value 배열. 스토어 섹션 재정렬·카드 부스트에 사용.';
