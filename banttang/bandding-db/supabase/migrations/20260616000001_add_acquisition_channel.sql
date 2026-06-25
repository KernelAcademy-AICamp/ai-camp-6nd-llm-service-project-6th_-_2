-- 신규 가입 채널 attribution 영속화
-- 실험: SNS 채널 신규 가입자 확보 비교 (docs/experiments/attribution-sns-channel-test.md)
-- 가입 시점의 first-touch 채널/UTM을 profiles에 기록해 가입 품질·LTV 후속 분석에 사용한다.

alter table public.profiles
  add column if not exists acquisition_channel text,
  add column if not exists acquisition_utm jsonb;

comment on column public.profiles.acquisition_channel is
  '가입 유입 채널 라벨 (reels / daangn_local / kakao_ad / direct 등). first-touch 기준.';
comment on column public.profiles.acquisition_utm is
  '가입 시점 first-touch UTM 파라미터 원본 (utm_source/medium/campaign/content/term).';

-- 채널별 가입·코호트 집계용 인덱스
create index if not exists idx_profiles_acquisition_channel
  on public.profiles (acquisition_channel);
