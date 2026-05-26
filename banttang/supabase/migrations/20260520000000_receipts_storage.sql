-- 영수증 이미지 보관용 Storage 버킷.
-- private 버킷 — 참여자만 signed URL로 열람 가능.
-- 업로드 자체는 인증된 사용자가 가능하지만, 경로 규칙으로 파티 참여자만 허용한다.
--   path layout: {party_id}/{receipt_id}.{ext}

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- SELECT: 승인된 파티 참여자만 본인 파티의 영수증을 볼 수 있다. (호스트 포함 — is_host와 무관)
create policy "receipts_select_member"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and exists (
      select 1
      from public.party_participants pp
      where pp.user_id = auth.uid()
        and pp.status = 'approved'
        and pp.party_id::text = split_part(name, '/', 1)
    )
  );

-- INSERT: 승인된 파티 참여자만 업로드 가능.
-- 실제 거래 인증(receipts row INSERT)은 FastAPI secret 키가 수행한다.
create policy "receipts_insert_member"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and exists (
      select 1
      from public.party_participants pp
      where pp.user_id = auth.uid()
        and pp.status = 'approved'
        and pp.party_id::text = split_part(name, '/', 1)
    )
  );

-- UPDATE/DELETE는 secret 키(FastAPI) 또는 운영자만. 별도 정책 없음.
