-- 거래 기록 + 리뷰. 플랫폼은 송금에 관여하지 않고 영수증으로 "결제됨"만 검증 (CLAUDE.md §3).

create type transaction_verification as enum (
  'pending',     -- 영수증 미제출
  'reviewing',   -- OCR + Claude 검증 중
  'verified',    -- 검증 완료
  'rejected'     -- 검증 실패 (운영자 개입 필요)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  total_amount integer not null check (total_amount >= 0),
  receipt_storage_path text,
  verification transaction_verification not null default 'pending',
  verification_reason text,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create index transactions_post_idx on public.transactions (post_id);

alter table public.transactions enable row level security;

create policy "transactions_select_member"
  on public.transactions for select
  using (
    exists (
      select 1 from public.post_participants p
      where p.post_id = transactions.post_id and p.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE는 FastAPI(service_role)에서만 수행한다.


create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  reviewer_id uuid not null references public.users (id) on delete cascade,
  reviewee_id uuid not null references public.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (post_id, reviewer_id, reviewee_id),
  check (reviewer_id <> reviewee_id)
);

create index reviews_reviewee_idx on public.reviews (reviewee_id, created_at desc);

alter table public.reviews enable row level security;

-- 누구나 다른 사용자의 리뷰를 읽을 수 있다 (프로필 페이지).
create policy "reviews_select_all"
  on public.reviews for select
  using (true);

-- 자신이 참여한 거래의 상대방만 평가 작성.
create policy "reviews_insert_participant"
  on public.reviews for insert
  with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.post_participants p
      where p.post_id = reviews.post_id and p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.post_participants p
      where p.post_id = reviews.post_id and p.user_id = reviews.reviewee_id
    )
  );
