-- 모집글-참여자 매핑. 호스트 1명 + 멤버 N명.
-- 선착순 join은 FastAPI에서 Redis 락으로 보호한 후 service_role로 insert.

create type participant_role as enum ('host', 'member');

create table public.post_participants (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role participant_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index post_participants_user_idx on public.post_participants (user_id);

alter table public.post_participants enable row level security;

-- 같은 모집글에 속한 사람끼리는 서로 볼 수 있다.
create policy "post_participants_select_member"
  on public.post_participants for select
  using (
    exists (
      select 1 from public.post_participants p
      where p.post_id = post_participants.post_id and p.user_id = auth.uid()
    )
  );

-- INSERT/DELETE는 service_role(FastAPI 락 통과 후)에서만.
-- 따라서 anon/authenticated 키에는 정책을 열어두지 않는다.
