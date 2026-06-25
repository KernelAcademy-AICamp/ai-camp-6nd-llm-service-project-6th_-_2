# AI 추천 (RAG-lite: 성향 → 후보 retrieval → LLM 재정렬·이유) — 설계

> 상태: 설계 / 구현 대기
> 결정(2026-06-17): 출력 = **재정렬 + 추천 이유** · 생성 = **cron 미리 계산·캐시**
> 원칙: retrieval은 기존 자산 재활용(LLM 0), 생성만 LLM. 매 렌더 호출 금지. 콜드스타트는 현재 점수 정렬 폴백.
> 관련: [user-propensity-tagging.md](user-propensity-tagging.md), [recommendation-personalization-ranking.md](recommendation-personalization-ranking.md), `lib/naver/signals.ts`, `lib/naver/cache.ts`, `lib/groupbuy.ts`

---

## 1. 왜 "RAG-lite"인가

RAG = 검색(Retrieve) → 맥락(Augment) → 생성(Generate). 이 프로젝트는 **retrieval을 이미 갖고 있다**:

| 단계 | 재사용 자산 | LLM |
|---|---|---|
| Retrieve | `getRankingSignals` + `scoreCard` 로 후보 상위 K 추림 (성향 태그·찜·공구·검색 신호) | ✗ |
| Augment | 성향 프로필 + 후보 K개를 압축 프롬프트로 | ✗ |
| Generate | Claude 재정렬 + 후보별 한 줄 추천 이유 (구조화 JSON) | ✓ |

**임베딩(pgvector)은 1일차 제외.** 후보는 동네 1곳 캐시 + 모집중 공구 몇 개라 N이 작아 키워드/섹션 매칭으로 shortlist 충분. 의미 매칭 누락이 실측되면 그때 pgvector 추가(§7).

---

## 2. 후보(문서) 소스 — 공구가 1순위

| 우선 | 소스 | 식별자(ref) | 비고 |
|---|---|---|---|
| ① | **모집중인 공구** — `parties` status='recruiting' (동네 내) + 플랫폼 `groupbuy` config(마감 미래) | `party:<id>` / `groupbuy:<slug>` | **전량 컨텍스트 포함**. 북극성 지표(거래 성사)와 직결된 우리 인벤토리. |
| ② | **네이버 동네 캐시** — `getNeighborhoodFeed` FeedCard | `naver:<link>` | 외부 상품. shortlist로 빈자리 채움. |

> 후보엔 내부 PK가 없는 것(네이버 link)이 섞이므로, 추천 결과는 **(ref, type)** 로 참조한다. LLM이 만든 ref는 입력 후보 집합과 대조해 검증(없으면 폐기 — 환각 방지).

---

## 3. 파이프라인 (cron, user × 동네)

```
[pg_cron 매시] → 활성 사용자 루프
  1. Retrieve : 후보 = 모집중 공구(전량) + 네이버 캐시 shortlist(top-K, signals 점수)
  2. Augment  : 성향 프로필(user_tags + favorite_categories + 최근 user_events 키워드)
                + 후보 목록(ref·title·section·price·[공구: 모집현황·마감])
  3. Generate : Claude(claude-sonnet-4-6) → 구조화 JSON
                { items: [{ ref, type, rank, reason }] }  // 입력 후보만, 이유는 한국어 한 줄
  4. Validate : ref 화이트리스트 대조 → 모르는 ref 제거, 누락 후보는 score 순 뒤에 append
  5. Store    : user_recommendations upsert (전체 재삽입 패턴)
```

**비용 가드 (중요):**
- **활성 사용자만** 돌린다(예: 최근 N일 내 행동 있는 user). 전체 사용자 매시 호출 금지.
- K ≈ 15~20으로 프롬프트 작게. 이유 생성이 대량이면 Haiku 검토(CLAUDE.md).
- 콜드스타트(성향·후보 없음) → LLM 스킵, 현재 `scoreCard` 정렬 + 일반 문구.

---

## 4. 저장 — `user_recommendations`

```sql
CREATE TABLE IF NOT EXISTS user_recommendations (
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    neighborhood_id uuid REFERENCES neighborhoods(id),
    items           jsonb NOT NULL,   -- [{ ref, type, rank, reason }]
    model           text  NOT NULL,   -- 'claude-sonnet-4-6'
    generated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id)
);
```
- 읽기는 즉시(캐시 적중), RLS: 본인 SELECT(운영은 service_role).
- items의 `ref`는 읽는 시점에 실제 후보(공구 active 여부·네이버 카드 존재)로 재검증 후 표시. 만료 공구는 숨김.

---

## 5. 실행 위치

CLAUDE.md 원칙: **AI 파이프라인 = FastAPI**(Claude 호출 + 후처리). 단 `@anthropic-ai/sdk`가 이미 web에 있고, 검색 캐시 cron이 `pg_cron → pg_net → Next 내부 라우트(/api/internal/refresh-feeds)` 패턴을 쓴다.

- **권장(MVP)**: 같은 패턴으로 **Next 내부 라우트** `/api/internal/refresh-recommendations` (SDK 재사용, CRON_SECRET 가드). 빠르게 검증.
- **확장 시**: 배치가 무거워지면 FastAPI 워커로 이관(원칙 정합). 설계는 그대로 옮겨짐.

모델: 추론·이유 `claude-sonnet-4-6`, 대량 저비용은 Haiku. 출력은 **tool/structured output으로 JSON 강제**, 후처리에서 zod 검증.

> 구현 착수 시 모델 ID·구조화 출력·프롬프트 캐싱 세부는 `claude-api` 스킬로 확인 후 확정.

---

## 6. 노출 (store 피드)

- "추천" 탭이 `user_recommendations.items`를 우선 사용 → 카드에 **추천 이유 한 줄** 표시("닭가슴살 자주 찾으시던데, 신림동 단백질 공구 모집 중이에요").
- 공구 아이템은 상단 고정 가중(전환 목표). 네이버 카드가 뒤를 채움.
- recs 없음/만료 → 기존 `rankSections` 폴백(우아한 저하).

---

## 7. 단계 & 향후

1. 후보 어셈블리 — 모집중 공구 + 네이버 shortlist 병합(`signals` 재사용).
2. LLM 재정렬·이유 서비스 + 구조화 출력 + ref 검증.
3. `user_recommendations` 테이블 + cron(활성 사용자만) refresh.
4. store 피드 연결 + 이유 표시 + 폴백.
5. **(향후) pgvector** — 의미 매칭 누락 실측 시 후보 title 임베딩 + 성향 임베딩 ANN로 retrieval 보강.

---

## 9. 구현 계획 (단계별)

> LLM 호출은 `@anthropic-ai/sdk`(web에 설치됨) + `zod`로 구조화 출력. 모델 `claude-sonnet-4-6`(CLAUDE.md), 대량이면 Haiku 4.5. `claude-api` 스킬 기준 확정.

### Phase 0 — 마이그레이션 (DB)
- `bandding-db/.../20260617000001_user_recommendations.sql` (+ supabase 복사본)
  - `user_recommendations` 테이블(§4) + RLS(본인 SELECT) + `idx`.
  - cron 등록은 검색캐시와 동일하게 `pg_cron → pg_net → Next 내부 라우트` (즉시 함수 호출 아님 — LLM은 앱에서).
  - Vault 시크릿: `recommend_app_url`, `recommend_cron_secret` 재사용(이미 있음).

### Phase 1 — 후보 어셈블리 (retrieval, LLM 0)
- `apps/web/lib/recommend/candidates.ts` (신규)
  - `getActiveGroupBuys(neighborhoodId)` — `parties` status='recruiting' + `lib/groupbuy.ts` config(마감 미래) 병합 → `{ref, type:'groupbuy'|'party', title, section, price, deadline, 모집현황}`.
  - `getNaverShortlist(profile, K)` — `getNeighborhoodFeed` → `getRankingSignals`+`scoreCard`로 정렬 → 상위 K(15) → `{ref:'naver:<link>', title, section, price(subtitle 파싱), subtitle}`.
  - `assembleCandidates(profile)` → 공구 전량 + 네이버 K. ref 중복 제거.

### Phase 2 — LLM 재정렬·이유 (생성)
- `apps/web/lib/recommend/generate.ts` (신규)
  - zod 스키마: `z.object({ items: z.array(z.object({ ref:z.string(), reason:z.string() })) })` (rank=배열 순서).
  - 프롬프트: **system**(고정 지침 — 캐시 대상) + **user**(성향 프로필 + 후보 목록 JSON).
    - 성향 = `user_tags`(라벨·evidence) + `favorite_categories` + 최근 `user_events` 키워드 top.
  - `client.messages.parse({ model:'claude-sonnet-4-6', max_tokens:2000, system:[{type:'text',text:SYS,cache_control:{type:'ephemeral'}}], output_config:{format: zodOutputFormat(Schema)}, messages:[{role:'user',content: userBlock}] })`.
  - **검증**: `parsed_output` ref를 후보 화이트리스트와 대조 → 모르는 ref 제거, 누락 후보는 score 순으로 뒤에 append. 이유 없으면 빈 문자열.
  - 콜드스타트/후보 0/LLM 실패 → `{items: scoreOrder}` 폴백(이유 없음).

### Phase 3 — 배치 적재 (cron)
- `apps/web/app/api/internal/refresh-recommendations/route.ts` (신규)
  - `CRON_SECRET` Bearer 가드(기존 refresh-feeds 패턴).
  - **활성 사용자만**: 최근 N일 `user_events` 있는 user 조회 → 각자 동네로 assemble→generate→`user_recommendations` upsert(전체 대체).
  - 동시성 제한(예: 5개씩) + 동네별 `getNeighborhoodFeed` 캐시 공유로 네이버 호출 0.

### Phase 4 — 노출 (store 피드)
- `apps/web/lib/recommend/read.ts` — `getUserRecommendations(userId)` → items의 ref를 현재 후보로 재검증(만료 공구 숨김).
- `app/(app)/store/page.tsx` "추천" 탭이 recs 우선 사용, 없으면 기존 `rankSections` 폴백.
- `StoreCard`/`StoreFeedTabs`에 **추천 이유 한 줄** 표시(있을 때만).

### Phase 5 — 검증
- 운영 화면(`/admin/recommend` 또는 신규)에서 특정 유저 recs + 이유 + 폴백 여부 확인.
- 비용 측정: 1회 호출 토큰·`usage`(cache_read 확인) 로깅. 활성 사용자 수 × 1회/시간 추산.

### 의존성·주의
- `zod`는 web에 있음. `@anthropic-ai/sdk` 클라이언트는 서버 전용 래퍼로(`lib/anthropic.ts` 신규, `ANTHROPIC_API_KEY` 서버 env) — 클라이언트 번들 유입 금지.
- 프롬프트 캐싱: system 지침 고정(타임스탬프·UUID 금지) → 후보·성향은 user 블록(캐시 뒤).
- 환각 차단은 **코드 검증이 1차**(스키마만으론 부족) — ref 화이트리스트 필수.

## 8. 리스크

- **비용/지연**: 활성 사용자 한정 + 캐시로 통제. 매 렌더 호출 절대 금지.
- **환각**: 후보 화이트리스트 대조로 LLM이 없는 상품·가격 만들지 못하게. 이유도 후보 사실에 근거.
- **신선도**: 공구 마감·품절은 읽는 시점 재검증으로 처리(캐시에 stale 가능).
- **콜드스타트**: 성향 0 → 현재 점수 정렬. AI는 데이터 쌓인 유저부터.
