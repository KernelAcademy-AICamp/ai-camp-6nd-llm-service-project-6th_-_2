# 추천 피드 개인화 랭킹 (5신호 점수 모델) — 설계

> 상태: 설계 확정 / 구현 대기
> 범위: **Phase 1 (신호 1·3·4 + 신선도 감쇠) + 신호 5 (검색·클릭 로그)**
> 제외(별도 RFC): 부정 신호(−2), 신호 2(연령·성별)
> 관련: [recommendation-feature 메모], `lib/naver/personalize.ts`, `lib/naver/cache.ts`

## 1. 배경

추천 피드는 **B안**으로 동작한다: 동네 단위로 네이버 검색 결과를 1시간 캐시(`search_cache`)해 사용자끼리 공유하고, 개인화는 **읽는 시점에 per-user 재정렬**만 한다. 네이버 재호출 0, 비용은 동네 수에만 비례.

현재 개인화는 신호 1(온보딩 관심사)만 쓰는 **이진 부스트**다 (`personalizeSections`: 키워드 일치 시 카드를 위로 0/1). 이를 **카드별 실수 점수 합산**으로 확장해 찜·공구·검색 행동까지 반영한다.

원칙은 그대로: **네이버 재호출 없음, 동네 캐시 공유 유지, 점수화는 전부 메모리 연산.**

## 2. 신호 정의 (확정 점수표)

| 신호 | 가중치 | 데이터 소스 |
|---|---|---|
| S1 명시 관심사 | 카테고리 일치 **+2** | `profiles.favorite_categories` |
| S3 찜 이력 | 카테고리 **+3** / 품목 **+5** | `store_favorites` (title, created_at) |
| S4 공구 참여 | 카테고리 **+5** / 품목 **+8** | `group_buy_participants.slug` → groupbuy config |
| S5 검색·클릭 | **+0.5 / 회 (같은 키워드 max +3)** | `user_events` (신규 테이블) |

신선도 감쇠와 매칭 방법은 §4–5.

## 3. 핵심 제약

1. **후보 카드는 외부(네이버) 데이터라 내부 카테고리·PK가 없다.** 모든 신호 매칭은 후보 카드 `title` ↔ 신호 키워드/섹션의 **텍스트 매칭**으로 귀결한다. 기존 `CATEGORY_INFO`(품목 value → 섹션·키워드 사전)를 단일 진실의 원천으로 재사용한다.
2. **찜·공구에도 카테고리 컬럼이 없다.** 찜은 저장된 `title`을 `CATEGORY_INFO` 키워드로 역매칭, 공구는 `slug` → config의 `categoryValue`로 매핑한다.
3. **콜드스타트**: 신호가 하나도 없으면 점수 0 → 캐시의 기존 `score`(네이버 가중치) 순서를 그대로 유지(우아한 폴백).

## 4. 점수 모델

후보 카드 `c`, 사용자 `u`:

```
score(c, u) = Σ_s  baseWeight(s) · decay(ageDays(s)) · match(c, s)   (s ∈ 사용자 신호)
```

- `match(c, s)`:
  - 신호 `s`의 **품목 키워드**가 `c.title`에 포함 → 강한 점수 (찜 +5 / 공구 +8)
  - 키워드 없고 **섹션만 일치** → 약한 점수 (찜 +3 / 공구 +5, S1 +2)
  - 불일치 → 0
- 한 카드가 여러 신호에 매칭되면 **합산** (예시 후보 A: S1 +2, S3품목 +5, S5 +1.5 = 8.5 재현).
- **중복 폭주 방지**: 같은 신호·같은 품목이 여러 건이면 **최신 1건 + 감쇠**만 반영(닭가슴살 2번 찜 → +5 한 번). 단, **S5만 누적**(검색 횟수 × 0.5, 같은 키워드 max +3).

### 신선도 감쇠

```
decay(days) = exp(-λ · days),   λ = ln(10) / 90 ≈ 0.0256
  → 0일 1.00 / 30일 0.46 / 60일 0.22 / 90일 0.10
```

"30일 절반·90일 거의 0" 규칙에 맞춘다. λ는 상수로 분리해 튜닝 가능하게 둔다. S1(온보딩 관심사)은 시점이 고정 선호라 **감쇠 미적용**(decay=1).

## 5. 모듈 설계

### 5.1 `lib/naver/personalize.ts` (확장)

기존 `personalizeSections`(이진)는 폴백용으로 남기고, 점수 기반 API 추가:

```ts
export type RankingSignal = {
  source: "interest" | "favorite" | "groupbuy" | "search";
  section: FeedSection;        // CATEGORY_INFO 기준 섹션
  keyword?: string;            // 품목 키워드(없으면 섹션 매칭만)
  ageDays: number;             // 신선도 감쇠 입력 (interest는 0)
};

// 카드 1장 점수 — 위 수식 그대로
export function scoreCard(card: { section; title }, signals: RankingSignal[]): number;

// 섹션 배열을 점수로 재정렬 (섹션 순서 + 섹션 내 카드)
export function rankSections<S>(sections: S[], signals: RankingSignal[]): S[];
```

가중치 상수는 한 곳에:
```ts
const W = { interest: 2, favCat: 3, favItem: 5, gbCat: 5, gbItem: 8, searchPer: 0.5, searchCap: 3 };
```

### 5.2 신호 수집 (서버) — `lib/naver/signals.ts` (신규)

```ts
export async function getRankingSignals(userId: string): Promise<RankingSignal[]>
```
한 번에 조회·정규화:
- `profiles.favorite_categories` → `CATEGORY_INFO`로 (section, keyword) 펼침, source="interest", ageDays=0
- `store_favorites`(user_id) → title을 `CATEGORY_INFO` 키워드로 역매칭, created_at→ageDays
- `group_buy_participants`(user_id) → slug→config.categoryValue→`CATEGORY_INFO`, created_at→ageDays
- `user_events`(user_id, kind in search/click, 최근 N일) → 키워드별 횟수 집계 후 0.5×count(cap 3)

### 5.3 `groupbuy.ts` 타입 보강

`GroupBuy`에 `categoryValue: string` 추가(예: sinbi-peach → `"fruit"`). slug→키워드 매핑을 config 한 곳에서.

### 5.4 `store/page.tsx` 연결

`getPersonalizedFeed` 경로에서 `getRankingSignals(me.id)` → `rankSections(...)`로 교체. 신호 0개면 폴백.

## 6. 신호 5 — 검색·클릭 로깅 (신규 마이그레이션)

`store_favorites` 패턴을 그대로 따른다(RLS 본인 행, storage 구문 없음 → SQL Editor 직접 적용).

```sql
CREATE TABLE IF NOT EXISTS user_events (
    id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('search', 'click')),
    keyword    text NOT NULL,          -- 검색어 또는 클릭 카드 title
    section    text,                   -- 알 수 있으면 FeedSection, 없으면 null
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_events_user_recent
    ON user_events(user_id, created_at DESC);
-- RLS: select/insert own (store_favorites와 동일 패턴)
```

**로깅 지점 (fire-and-forget, 실패 무시):**
- `/store/search` 제출 시 → kind='search', keyword=q
- 스토어 카드 클릭 → kind='click', keyword=title, section
- 비용·노이즈 관리: 같은 키워드 단시간 중복은 클라에서 디바운스, 집계는 최근 90일만.

> 부정 신호(−2)는 **노출(impression) 로깅**이 전제라 이 테이블에 'impression' kind를 더하면 확장 가능하지만, 이번 범위 밖(별도 RFC).

## 7. 검증

예시(20대, 식품·리빙 관심, 닭가슴살 2찜, 휴지 1공구)로 후보 A/B/C 점수가 8.5 / 7.6 / (C는 S2 제외라 0) → **A → B → C** 정렬 재현되는지 단위 테스트. 감쇠 경계(0/30/90일) 별도 테스트.

## 8. 운영자 추천 디버거 (`/admin/recommend`)

특정 사용자에게 추천이 "왜 이렇게 떴는지" 검증하는 운영 도구.
- 닉네임으로 조회 → 프로필·신호 카운트(찜/공구/검색)·관심사·가입일수 요약.
- 동네 후보 피드(`getNeighborhoodFeed`)를 5신호 점수로 정렬, 상위 N개와 **카드별 점수 내역**(`explainCard`) 표시. 신호별 base·신선도 감쇠 계수·net 기여를 모두 노출.
- 구현: `lib/naver/personalize.ts` `explainCard`/`ScoreLine`, 탭은 `app/admin/_components/nav.tsx`(모집글·커뮤니티·추천 디버거 공용).

## 9. 신호 2(성별) — 구현됨 / 미포함분

- **성별 신호 ✅**: `profiles.gender` → `GENDER_AFFINITY`(female → beauty·fashion, +1, 감쇠 없음). "강하게 적용하면 편견" 원칙대로 약하게.
- **연령 ❌**: `profiles`에 생년·연령 컬럼이 **없음**(본인인증 Phase 2). 온보딩 생년 수집 RFC 선행 필요.
- **부정 신호 (−2) ❌**: 노출(impression) 로깅 필요. `user_events`에 `kind='impression'` 추가로 후속 확장.
