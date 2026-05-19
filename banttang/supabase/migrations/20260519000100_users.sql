-- 사용자 프로필 (Supabase auth.users 보강).
-- 본인인증 결과(성별/생년월일)는 화면에 가공된 값만 노출. raw 값은 별도 컬럼에 암호화 저장 예정.

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname citext unique not null check (char_length(nickname) between 2 and 16),
  avatar_url text,
  gender text check (gender in ('male', 'female', 'unknown')) default 'unknown',
  birth_year smallint check (birth_year between 1900 and extract(year from now())::int),
  trust_score integer not null default 50 check (trust_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is '서비스 프로필. 본인인증 raw값은 별도 테이블에 암호화하여 분리 저장.';

alter table public.users enable row level security;

-- 누구나 다른 사람 프로필을 읽을 수 있다 (닉네임, 신뢰점수 표시 목적).
create policy "users_select_all"
  on public.users for select
  using (true);

-- 자기 자신만 수정.
create policy "users_update_self"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 가입 직후 본인 row 생성만 허용.
create policy "users_insert_self"
  on public.users for insert
  with check (auth.uid() = id);
