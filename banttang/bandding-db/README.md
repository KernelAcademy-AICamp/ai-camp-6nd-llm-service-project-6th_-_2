# 반띵 (Bandding) — Supabase DB Schema

동네 1인가구 공동구매 서비스 MVP의 Supabase 데이터베이스 스키마입니다.

## 📂 파일 구성

```
bandding-db/
├── supabase/migrations/
│   ├── 20260520000001_initial_schema.sql   # 테이블/인덱스/함수/트리거/뷰
│   ├── 20260520000002_rls_policies.sql     # RLS 정책 + Realtime
│   ├── 20260520000003_storage.sql          # Storage 버킷 + 정책
│   └── 20260520000004_seed.sql             # 베타 동네/픽업장소 시드
├── database.types.ts                        # TypeScript 타입 정의
└── test_scenario.sql                        # E2E 검증 시나리오
```

## 🚀 적용 방법

### Supabase CLI 사용 (권장)

```bash
# 1. Supabase 프로젝트 디렉토리에서 migrations 폴더에 SQL 복사
cp -r bandding-db/supabase/migrations/* <your-project>/supabase/migrations/

# 2. 로컬에서 검증
supabase db reset

# 3. 원격 적용
supabase db push
```

### Supabase Studio (SQL Editor) 사용

`supabase/migrations/` 안의 4개 파일을 순서대로 실행하세요.

### ⚠️ 사전 준비

Supabase 대시보드 → **Database → Extensions**에서 활성화:
- `postgis` (위치 기반)
- `pg_cron` (마감 자동 처리)
- `pg_trgm` (가게명 검색)

## 🏗️ 아키텍처 결정 사항

### 1. parties 단일 테이블 + category enum

Phase 1(배달)과 Phase 2(장보기)를 **하나의 테이블**로 통합.

- ✅ 채팅/영수증/평가/송금 로직 100% 재사용
- ✅ 마이페이지/홈 피드에서 단일 쿼리로 조회
- ✅ category별 다른 컬럼이 필요해지면 nullable 컬럼 또는 별도 detail 테이블로 확장 가능

### 2. 호스트도 `party_participants`에 row를 가진다

`is_host=true`로 구분. 채팅방 멤버 조회, 평가 대상 조회 등에서 호스트/참여자 분기 로직 제거.

### 3. 신뢰점수: 컬럼 + trigger 갱신

`v_user_trust_stats` 뷰로 매번 계산 vs 컬럼 + trigger 갱신 → **후자 선택**.

- 마이/프로필/채팅방 헤더 등 **읽기 빈도가 압도적**으로 높음
- trigger 한 곳에서 갱신 책임을 가지므로 일관성 유지
- `compute_user_level()` 함수로 등급 계산 로직 단일화

### 4. 자동 모집 마감 + 채팅방 오픈

`party_participants.status`가 `approved`로 들어오는 순간 trigger가:
1. approved 카운트 = max_participants 이면 `parties.status = 'closed'`
2. `chat_rooms` 자동 INSERT
3. `chat_messages`에 시스템 메시지 자동 INSERT

> ⚠️ INSERT/UPDATE 모두에 발화 (auto-approval은 처음부터 approved로 INSERT됨)

### 5. cron 기반 상태 전이

매 분마다 `transition_expired_parties()` 실행:
- 신청 마감시각 지났는데 인원 미달 → `cancelled`
- 거래 시각 도달 → `in_progress`

### 6. 결제: 외부 송금 + 기록만

카카오톡 송금 방식. DB는 `payments` 테이블에 `pending → sent_by_payer → confirmed_by_receiver` 단계만 기록.

### 7. Lazy Auth: anon SELECT 허용 범위

| 테이블 | anon SELECT |
|---|---|
| `neighborhoods`, `pickup_locations` | ✅ |
| `parties`, `party_photos`, `party_participants` | ✅ (둘러보기) |
| `profiles` | ✅ (공개 닉네임/등급) |
| 그 외 (chat/receipt/payment/review/notification) | ❌ |

## 🔐 보안 (RLS)

모든 테이블에 RLS 활성화. 핵심 헬퍼 함수:

```sql
is_party_member(party_id)  -- 승인된 참여자인가
is_party_host(party_id)    -- 호스트인가
is_room_member(room_id)    -- 채팅방 멤버인가
```

`SECURITY DEFINER`로 정의하여 RLS 재귀를 방지합니다.

## 📡 Realtime 구독 대상

```sql
chat_messages         -- 채팅
party_participants    -- 신청/승인 알림
parties               -- 상태 변경
notifications         -- 인앱 알림
payments              -- 송금 상태
receipts              -- 영수증 등록
```

## 🗂 Storage 버킷

| 버킷 | 공개 | 용도 | 경로 규약 |
|---|---|---|---|
| `party-photos` | public | 모집글 사진 | `{party_id}/{filename}` |
| `receipts` | private | 영수증 | `{party_id}/{filename}` |
| `profile-images` | public | 프로필 사진 (Phase 2) | `{user_id}/{filename}` |

private 버킷은 signed URL로 접근. RLS 함수가 `storage.foldername(name)[1]`로 추출한 ID를 검증.

## 🧪 검증된 시나리오

`test_scenario.sql`은 다음을 모두 검증합니다:

1. ✅ 프로필 생성
2. ✅ 모집글 생성 시 호스트 자동 등록
3. ✅ 신청 → 정원 충족 시 자동으로 status=closed + 채팅방 + 시스템 메시지
4. ✅ 영수증 등록
5. ✅ 송금 기록
6. ✅ 거래 완료 시 모든 참여자 transaction_count 증가
7. ✅ 평가 작성 시 reviewee 신뢰점수 갱신
8. ✅ `no_self_review`, `no_self_payment` CHECK 제약 동작
9. ✅ View (`v_parties_with_stats`, `v_user_trust_stats`) 정상

## 📈 등급 산정 로직

`compute_user_level(tx_count, good_count, total_count)`:

| 등급 | 조건 |
|---|---|
| 🌻 dandelion (민들레) | 기본값 |
| 🌳 tree (나무) | 거래 3회+ AND 좋아요 비율 80%+ |
| 👑 king (왕대왕) | 거래 10회+ AND 좋아요 비율 90%+ |

조정이 필요하면 `compute_user_level()` 함수만 수정하면 됩니다.

## 🔄 운영 시 주의사항

### 신뢰점수 컬럼 재계산

사용자 신뢰점수 컬럼이 trigger 누락 등으로 깨졌을 때 재계산:

```sql
-- 특정 유저
UPDATE profiles p SET
    good_review_count  = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = p.id AND rating = 'good'),
    bad_review_count   = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = p.id AND rating = 'bad'),
    total_review_count = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = p.id),
    transaction_count  = (SELECT COUNT(DISTINCT pp.party_id)
                          FROM party_participants pp
                          JOIN parties pt ON pt.id = pp.party_id
                          WHERE pp.user_id = p.id
                            AND pp.status = 'approved'
                            AND pt.status = 'completed')
WHERE p.id = '...';

-- 등급 일괄 재계산
UPDATE profiles SET level = compute_user_level(transaction_count, good_review_count, total_review_count);
```

### 베타 동네 추가

```sql
INSERT INTO neighborhoods (name, district, city, center_point, is_active)
VALUES (
    '서울대입구',
    '관악구',
    '서울특별시',
    ST_SetSRID(ST_MakePoint(126.9527, 37.4812), 4326)::geography,
    true
);
```

## ⚡ TypeScript 사용 예

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabase = createClient<Database>(URL, KEY);

// 홈 피드: 동네별 모집중인 글
const { data: parties } = await supabase
  .from('v_parties_with_stats')
  .select('*')
  .eq('neighborhood_id', neighborhoodId)
  .in('status', ['recruiting', 'closed'])
  .order('apply_deadline_at', { ascending: true });

// 채팅 실시간 구독
const subscription = supabase
  .channel(`room:${roomId}`)
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
      (payload) => { /* 새 메시지 처리 */ })
  .subscribe();
```

## 🛣 향후 확장 포인트

| 요구 | 확장 방법 |
|---|---|
| 차단/숨김 | `user_blocks` 테이블 추가 + parties 조회 시 필터 |
| 단골 가게 즐겨찾기 | `favorite_stores` 테이블 추가 |
| 호스트 신고 누적 시 자동 정지 | `profiles.is_suspended` 컬럼 + report 트리거 |
| 정산/세금계산서 (수익화 시) | `payments`에 `fee` 컬럼 추가 + PG 연동 |
| 푸시 알림 토큰 | `push_tokens` 테이블 추가 |
| 검색 기능 강화 | 이미 `pg_trgm` 인덱스 깔려있음, `parties USING gin (store_name gin_trgm_ops)` |
