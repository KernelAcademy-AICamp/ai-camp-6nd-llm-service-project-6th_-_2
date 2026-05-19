-- 모집글. 좌표는 geography(POINT) + GIST 인덱스로 ST_DWithin 활용 (CLAUDE.md §5).

create type post_kind as enum ('grocery', 'delivery');

create type post_status as enum (
  'open',       -- 모집 중
  'matched',    -- 정원 마감, 거래 대기
  'settling',   -- 영수증 검증 중
  'completed',  -- 거래 완료
  'cancelled'
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users (id) on delete cascade,
  kind post_kind not null,
  title text not null check (char_length(title) between 2 and 60),
  description text,
  meeting_point geography(point, 4326) not null,
  capacity smallint not null check (capacity between 2 and 8),
  joined_count smallint not null default 1 check (joined_count >= 0),
  status post_status not null default 'open',
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_meeting_point_gix on public.posts using gist (meeting_point);
create index posts_status_idx on public.posts (status) where status = 'open';

alter table public.posts enable row level security;

-- 모집 중인 글은 누구나 본다.
create policy "posts_select_open"
  on public.posts for select
  using (status <> 'cancelled');

-- 본인만 작성/수정/삭제.
create policy "posts_insert_self"
  on public.posts for insert
  with check (auth.uid() = author_id);

create policy "posts_update_author"
  on public.posts for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "posts_delete_author"
  on public.posts for delete
  using (auth.uid() = author_id);
