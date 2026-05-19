-- 청년몽땅정보통 등에서 크롤링한 1인 가구 혜택 정보.
-- FastAPI 워커가 service_role로 upsert. 클라이언트는 읽기만.

create table public.benefit_articles (
  id uuid primary key default gen_random_uuid(),
  source text not null,                        -- 예: 'youth.seoul.go.kr'
  external_id text not null,                   -- 출처 시스템의 식별자
  title text not null,
  summary text,
  url text not null,
  region text,                                 -- 예: '서울특별시 관악구'
  tags text[] not null default '{}',
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (source, external_id)
);

create index benefit_articles_region_idx on public.benefit_articles (region);
create index benefit_articles_published_idx
  on public.benefit_articles (published_at desc nulls last);

alter table public.benefit_articles enable row level security;

create policy "benefit_articles_select_all"
  on public.benefit_articles for select
  using (true);

-- INSERT/UPDATE는 FastAPI(service_role)에서만.
