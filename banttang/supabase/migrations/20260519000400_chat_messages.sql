-- 모집글당 1채팅방. Realtime 구독으로 메시지 스트리밍 (CLAUDE.md 기술 스택).
-- 권한 체크는 RLS만으로 끝낸다. "참여자만 SELECT"라는 규칙을 정책으로 선언.

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index chat_messages_post_created_idx
  on public.chat_messages (post_id, created_at desc);

alter table public.chat_messages enable row level security;

-- 참여자만 메시지를 읽고 보낼 수 있다.
create policy "chat_messages_select_member"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.post_participants p
      where p.post_id = chat_messages.post_id and p.user_id = auth.uid()
    )
  );

create policy "chat_messages_insert_member"
  on public.chat_messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.post_participants p
      where p.post_id = chat_messages.post_id and p.user_id = auth.uid()
    )
  );
