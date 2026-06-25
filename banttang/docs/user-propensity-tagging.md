# 사용자 성향 태깅 (행동 로그 → SQL 집계 → 태그) — 설계

> 상태: **구현 완료** (2026-06-16, 마이그레이션 원격 반영)
> 범위: `user_actions`(논리 모델) → pg_cron 1시간 SQL 집계 → `user_tags` → 추천 가중치 + 운영 도구 화면
> 원칙: **ML 없음, SQL만. 추가 인프라 없음. 전부 Supabase 안에서.**
> 결정(2026-06-16): 봇 제외 **미적용**(is_bot 범위 밖) · 찜·공구 **통합 적재** · user_tags **전체 재삽입** · 운영 화면 **닉네임** 조회
> 관련: [recommendation-personalization-ranking.md](recommendation-personalization-ranking.md)(읽기 시점 5신호 모델), `lib/naver/signals.ts`, `lib/naver/personalize.ts`, `/admin/recommend`

---

## 1. 배경 & 5신호 모델과의 관계

지금 추천은 **읽는 시점 per-user 재정렬**이다(5신호 모델). `signals.ts`가 찜·공구·검색·관심사를 매 요청마다 조회해 카드별 점수를 매긴다. 카드 단위의 **미세 매칭**에 강하지만, "이 사람은 어떤 사람인가"라는 **거친 성향(prior)** 은 없다.

성향 태깅은 이 prior를 **미리 계산해 저장**하는 보완 레이어다.

| | 5신호 모델 (기존) | 성향 태깅 (이 문서) |
|---|---|---|
| 계산 시점 | 읽을 때 실시간 | pg_cron 1시간 배치 |
| 단위 | 카드 1장 점수 | 사용자 1명 태그 |
| 용도 | 피드 정렬 | 정렬 가점 + 운영 분석 |
| 저장 | 없음(메모리) | `user_tags` 영속 |

**둘은 경쟁이 아니라 합산이다.** 태그는 섹션/키워드에 약한 가점을 더하는 prior로 5신호 점수에 얹힌다(§6).

---

## 2. 데이터 소스 — 신규 테이블 대신 기존 3소스 + 뷰

목업은 `user_actions(user_id, action_type, target, category, price, timestamp)` 단일 테이블을 그린다. 하지만 행동 데이터는 **이미 3곳에 흩어져 있다**:

| action_type | 소스 테이블 | 비고 |
|---|---|---|
| `favorite` (찜) | `store_favorites(title, created_at)` | category는 title 역매칭 |
| `groupbuy` (공구) | `group_buy_participants(slug, created_at)` | category는 slug→config |
| `search` / `click` | `user_events(kind, keyword, section, created_at)` | **price·category 미보유** |

CLAUDE.md 원칙(*"Supabase로 충분한 걸 옮기지 마라 / 중복 금지"*)에 따라 **새 `user_actions` 테이블로 복제하지 않는다.** 대신:

### 2.1 `user_events` 확장 — 통합 적재 (결정: Q1)
**찜·공구를 포함한 모든 행동을 클릭 시점에 `user_events`로 통합 적재한다(단일 경로).** category 역매칭을 SQL에서 하지 않고, 행동이 일어나는 앱 코드에서 이미 알고 있는 `section`·`price`를 그대로 박는다.

```sql
-- kind 확장: 기존 'search'|'click' → 'favorite'|'groupbuy' 추가
ALTER TABLE user_events DROP CONSTRAINT IF EXISTS user_events_kind_check;
ALTER TABLE user_events ADD CONSTRAINT user_events_kind_check
  CHECK (kind IN ('search', 'click', 'favorite', 'groupbuy'));

ALTER TABLE user_events ADD COLUMN IF NOT EXISTS category text;    -- FeedSection(food/living/...)
ALTER TABLE user_events ADD COLUMN IF NOT EXISTS price    integer; -- 카드 가격(원), 없으면 null
```

적재 지점:
- **찜** — `app/_actions/store-events.ts` 찜 토글 시 `kind='favorite'`, target=title, category=섹션, price=카드 가격.
- **공구** — 공구 참여 액션에서 `kind='groupbuy'`, target=slug, category=config의 categoryValue.
- **검색·클릭** — 기존 그대로(`lib/store-events.ts`), 클릭은 category·price 추가 적재. 검색은 price null.

> `store_favorites`·`group_buy_participants`는 **도메인 진실의 원천으로 유지**(찜 목록·참여 관리). `user_events`는 그와 별개의 **행동 로그**로, 태그 집계의 단일 입력이 된다(이중 기록이지만 용도가 다름 — 하나는 상태, 하나는 이벤트 스트림).

### 2.2 통합 뷰 `v_user_actions` (집계 입력의 단일 원천)
통합 적재 후엔 `user_events`가 곧 전체 행동 로그라 뷰가 사실상 user_events 그대로다. 목업 논리 스키마(`action_type` 네이밍)와 맞추는 얇은 별칭 뷰만 둔다.

```sql
CREATE OR REPLACE VIEW v_user_actions AS
  SELECT user_id, kind AS action_type, keyword AS target, category, price, created_at
    FROM user_events;
```

### 대안(채택 안 함)
목업 그대로 단일 `user_actions` 테이블 + 모든 행동 dual-write. 일관성은 좋지만 찜·공구가 이미 자기 테이블을 가지므로 **2중 기록·정합성 부담**. PMF 단계에선 과투자 → 보류.

---

## 3. 봇 제외 — 범위 밖 (결정)

목업은 *"is_bot=true 봇 데이터는 태그 집계 제외"* 를 권장하지만, 현재 `profiles`에 봇 플래그가 없고 이번 범위에서 **추가하지 않는다**. 집계는 봇 포함 전체 사용자를 대상으로 한다.

> 후속: 봇 트래픽이 태그 통계를 의미 있게 오염시키는 것이 관찰되면 별도로 `profiles.is_bot` + `WHERE NOT is_bot` 필터를 추가한다(이 문서 git 이력에 설계는 보존).

---

## 4. 산출 테이블 `user_tags` + 규칙 테이블 `tag_rules`

### 4.1 `user_tags` (집계 결과)
```sql
CREATE TABLE IF NOT EXISTS user_tags (
    user_id    uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tag        text    NOT NULL,             -- 'food_focused' 등 (코드 키)
    confidence numeric NOT NULL,             -- 0~1, 화면의 0.78
    evidence   text    NOT NULL,             -- "전체 활동 중 식품 78% · 닭가슴살·계란 반복"
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_user_tags_tag ON user_tags(tag);
```
집계는 매 실행마다 **사용자별 태그 전체 삭제 후 재삽입**(결정 Q2). 임계 미달로 사라진 태그가 자동 정리돼 단순하다. `refresh_user_tags()`가 한 트랜잭션에서 `DELETE FROM user_tags; INSERT INTO user_tags SELECT ...` (또는 갱신 대상 user 범위로 DELETE 후 INSERT).

### 4.2 `tag_rules` (임계값 — 코드 수정 없이 운영자가 조정)
목업 PM 노트: *"임계값(예: 카테고리 70%)을 설정 테이블로 빼서 운영자가 코드 수정 없이 조정"*.
```sql
CREATE TABLE IF NOT EXISTS tag_rules (
    tag        text PRIMARY KEY,        -- 'food_focused'
    label      text NOT NULL,           -- '식품 위주'
    threshold  numeric NOT NULL,        -- 0.70
    params     jsonb NOT NULL DEFAULT '{}',  -- 규칙별 추가 파라미터
    enabled    boolean NOT NULL DEFAULT true
);
```
집계 함수가 이 테이블을 읽어 임계값을 적용. 운영 화면에서 수정 → 다음 Cron 주기에 반영.

---

## 5. 집계 — pg_cron 1시간 (`search_cache_cron` 패턴 그대로)

`20260529000002_search_cache_cron.sql`이 이미 같은 패턴을 쓴다. 동일하게:

```sql
CREATE OR REPLACE FUNCTION refresh_user_tags() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- user_tags 비우고(전체 재삽입) → v_user_actions 30일 활동 집계
  --   → tag_rules 임계값 적용 → confidence + evidence 문자열 생성 → INSERT
  DELETE FROM user_tags;
  -- INSERT INTO user_tags (...) SELECT ... FROM v_user_actions ... JOIN tag_rules ...
END $$;

SELECT cron.schedule('refresh-user-tags', '0 * * * *', $$ SELECT refresh_user_tags(); $$);
```
> 초기 1시간 주기, 부하 보고 후 조정(목업 노트). 30일 윈도우는 화면의 "최근 30일 기준"과 일치.

---

## 6. 활용 ① — 추천 점수 가점

`signals.ts`에서 `user_tags`를 함께 읽어 태그를 **약한 섹션 prior**로 추가한다(기존 5신호에 합산, 별도 신호 source `"tag"`).

| 태그 | 추천 반영 |
|---|---|
| `food_focused` | food 섹션 약가점 |
| `value_seeker` | 저가 카드 약가점 / 정렬 시 가격 가중 |
| `costco_lover` | mall=코스트코 카드 가점 |
| `evening_user`·`active_participant` | 정렬 영향 작음, 주로 운영 분석용 |

가점 크기는 작게(예 +1, 감쇠 없음) — "강하게 적용하면 편견" 원칙(personalize.ts §9와 동일).

---

## 7. 활용 ② — 운영 도구 화면 (목업 #1)

기존 `/admin/recommend`("추천 디버거")는 **카드별 점수 내역**이고, 목업 화면은 **사용자별 성향 프로필**이라 성격이 다르다. → **새 탭 "성향 태그"** 추가(`AdminNav`에 4번째 탭).

화면 구성(목업 그대로):
- 상단: **닉네임** 조회 폼(결정 Q3 — 기존 디버거와 통일). 목업의 "user_8421"은 닉네임 자리로 대체.
- 프로필 카드: 닉네임·동네·연령대·성별·가입일 + 찜/공구/검색/활동 카운트
- **부여된 태그**: `user_tags` 행을 confidence 배지 + evidence 한 줄로. 아이콘은 tag별 매핑.
- **카테고리 활동 분포**: `v_user_actions` 30일 category 비율 막대(식품 78% …).
- 푸터: "1시간 전 갱신"(`updated_at`), "임계값은 운영 설정에서 조정"(→ `tag_rules` 편집 링크).

RLS: `user_tags` SELECT는 본인 + admin, `tag_rules`는 admin 전용.

---

## 8. 태그 카탈로그 (초기 6종, 목업 기준)

| tag 키 | 라벨 | 규칙(요지) | confidence | evidence 예 |
|---|---|---|---|---|
| `food_focused` | 식품 위주 | category=food 비율 ≥ threshold(0.70) | 비율 | "식품 78% · 닭가슴살·계란 반복" |
| `value_seeker` | 가성비 추구 | 평균 클릭 가격 하위 30% + 낮은가격순 정렬 횟수 | 정규화 점수 | "평균 클릭 가격대 하위 30% · 낮은순 9회" |
| `active_participant` | 적극 참여자 | 월 공구 참여 ≥ N / 상위 백분위 | 백분위 | "한 달 공구 5회 · 상위 15%" |
| `evening_user` | 저녁 사용자 | 19~23시 활동 비율 ≥ threshold | 비율 | "활동 81%가 19~23시" |
| `costco_lover` | 코스트코 선호 | 코스트코 명시/클릭률 | 클릭률 | "선호 몰 코스트코 + 클릭률 높음" |
| `weekend_user` | 주말 사용자 | 주말 활동 비율(확장) | 비율 | — |

각 규칙은 `v_user_actions` + `tag_rules.threshold`로 순수 SQL. 임계 미달이면 태그 미부여.

---

## 9. 결정 완료 (2026-06-16)

- **Q1. 찜·공구 적재** → **통합 적재**. 모든 행동을 클릭 시점에 `user_events`로(§2.1).
- **Q2. user_tags 갱신** → **전체 재삽입**. `DELETE` 후 `INSERT`(§4.1, §5).
- **Q3. 운영 화면 조회 키** → **닉네임**(기존 디버거와 통일, §7).
- **Q4. 봇 제외** → **미적용**. is_bot 범위 밖(§3).

---

## 10. 구현 순서 (제안)

1. **마이그레이션** — `user_events` kind 확장 + `category/price` 컬럼, `user_tags`, `tag_rules` + 시드, `v_user_actions` 뷰, RLS.
2. **로깅 보강** — 통합 적재: `_actions/store-events.ts`(찜·공구 `kind` 추가), `lib/store-events.ts` 클릭 시 category·price 적재.
3. **집계 함수 + cron** — `refresh_user_tags()`(전체 재삽입) + 태그 6종 SQL + `cron.schedule`.
4. **운영 화면** — `/admin/recommend`에 "성향 태그" 탭 또는 신규 라우트.
5. **추천 반영** — `signals.ts`에 `tag` source 추가, `personalize.ts` 가점.
6. **검증** — 봇 제외 확인, 임계값 변경→다음 주기 반영, 태그 evidence 정확도 스팟체크.
