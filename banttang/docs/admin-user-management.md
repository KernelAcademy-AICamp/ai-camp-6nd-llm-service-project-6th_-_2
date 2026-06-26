# 사용자 관리 (운영자) — 개발 계획

> 상태: 계획 / 결정 대기
> 목업: docs/mockups/admin-users.html · member_activity_dashboard · admin_member_console
> 현황: `/admin/recommend`(추천·성향)가 이미 **프로필·성향 태그·카테고리 분포·추천 점수 내역** 보유. 빠진 건 ① 사용자 목록 ② 운영 액션(제재·운영자·봇) ③ 활동 타임라인.

## 1. 범위

| 구성 | 현황 | 할 일 |
|---|---|---|
| **목록** `/admin/users` | 없음 | 검색·필터·정렬·페이지네이션 + 상태 배지 + 행 액션 |
| **상세 콘솔** | `/admin/recommend?u=` (태그·분포·추천점수 ✓) | **활동 타임라인** + **운영 액션** + 상태 배지 추가 |
| **운영 액션** | 없음 | 제재/해제 · 운영자 지정/해제 · 봇 표시/해제 |
| **(선택) 활동 대시보드** | 없음 | 전체 DAU/WAU·퍼널 — 별도/후순위 |

## 2. 선행 — 스키마 (Phase 0)

목업의 배지·필터·액션이 동작하려면 `profiles`에 2개 컬럼이 필요(현재 없음):

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;      -- null=정상
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_reason text;
CREATE INDEX IF NOT EXISTS idx_profiles_admin_list ON profiles(last_active_at DESC);
```
- 상태 = `suspended_at IS NULL ? 정상 : 제재` (enum 대신 nullable 타임스탬프 — 사유·해제 추적 쉬움).
- `is_bot`은 시드 봇 마킹 + 성향/추천 집계 제외(선택)에 재사용. (앞서 보류했던 플래그가 여기서 필요해짐)
- `last_active_at`·`transaction_count`·`good/bad_review_count`는 이미 존재 → 정렬·카운트에 활용.

## 3. 목록 페이지 (Phase 1) — `/admin/users`

- 조회: `profiles` + 카운트. 검색(nickname/id), 필터(전체/신규/운영자/봇/제재), 정렬(최근활동/가입/거래/신뢰).
  - 신규 = `transaction_count=0 AND joined_at` 최근 / 운영자 = `is_admin` / 봇 = `is_bot` / 제재 = `suspended_at IS NOT NULL`.
- 페이지네이션(range, 50개씩). 요약 통계 4(전체·주간활성·봇·제재).
- 행 → 상세 콘솔로 이동(`?u=닉네임`). 행 우측 ⋯ 빠른 액션.
- `AdminNav`에 **"사용자"** 추가.

## 4. 운영 액션 (Phase 2) — server actions, `requireAdmin`

`_actions/admin-users.ts` (기존 admin.ts ensureAdmin 패턴):
- `adminSuspendUser(id, reason)` / `adminUnsuspendUser(id)` — `suspended_at` 설정/해제.
- `adminSetBot(id, v)` — `is_bot` 토글.
- `adminSetAdmin(id, v)` — `is_admin` 토글. **가드: 본인 강등 금지 · 마지막 운영자 강등 금지.**
- 모두 admin 클라이언트로 update + `revalidatePath`. 감사 로그(운영자 접근 기록)는 후속.

## 5. 상세 콘솔 (Phase 3) — `/admin/recommend` 확장

목업(admin_member_console)대로 기존 페이지에 2가지 추가:
- **운영 액션 바** — 상태 배지 + 제재/운영자/봇 버튼(위 server actions 연결).
- **활동 타임라인** — `user_events`(검색·클릭·찜·공구) + 거래 이벤트(`payments`/`reviews`/`party_participants`)를 **시간순 merge**, 날짜 그룹. → 신규 통합 쿼리 `lib/admin/user-activity.ts` 1개.

## 6. (선택) 활동 대시보드 (Phase 4)
전체 DAU/WAU·행동 분포·활성화 퍼널. 별도 `/admin/activity` 또는 `/admin` 메인. **후순위** — 목록·상세가 먼저.

## 7. 결정이 필요한 항목
- **Q1. 정보구조(IA)** — (a) "사용자" 탭 신설하고 **추천·성향을 상세로 흡수**(탭: 모집글·커뮤니티·사용자) / (b) "사용자" 탭 + "추천·성향" 탭 **둘 다 유지**.
- **Q2. 상태 모델** — `suspended_at`(nullable, 권장) / `status` enum.
- **Q3. 상세 라우트** — `/admin/recommend?u=` 확장(권장, 이미 다 있음) / `/admin/users/[id]` 신규.
- **Q4. is_bot 집계 제외** — 이번에 성향·추천 집계에서 `WHERE NOT is_bot` 같이 적용 / 표시만 하고 집계는 나중.

## 8. 구현 순서 (제안)
Phase 0(스키마) → 1(목록+나브) → 2(액션) → 3(상세 타임라인·액션) → (4 대시보드).
**MVP는 0~3** — "전체 사용자 보고, 한 명 들어가 활동 보고, 제재/지정한다"가 한 바퀴 돌면 완성.

---

## 9. 확정 계획 (결정 반영 · 2026-06-23)

**기존 자산**: `/admin/members`(읽기 전용 회원 목록, `listAllMembers`) + `/admin/recommend`(추천·성향 콘솔) 둘 다 존재. AdminNav 탭 = 모집글·커뮤니티·회원·추천·성향.

결정:
- **Q1 → 기존 "회원" 탭을 개선하고 "추천·성향"을 흡수.** 최종 탭: **모집글 · 커뮤니티 · 회원**. "추천·성향" 탭 제거.
- **Q2 → 상세는 `/admin/members/[id]`(id 기반) 신규.** 기존 `/admin/recommend`의 콘솔 로직(프로필·태그·분포·추천점수)을 [id] 라우트로 이전 + 활동 타임라인·운영 액션 추가.
- **Q3 → `suspended_at`(nullable) + `suspended_reason`.**
- **Q4 → 봇 필터링 제외.** `is_bot` 컬럼·봇 배지·봇 필터·봇 토글 전부 스코프 밖.

### Phase 0 — 스키마
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_reason text;
CREATE INDEX IF NOT EXISTS idx_profiles_admin_list ON profiles(last_active_at DESC);
```

### Phase 1 — 회원 목록 개선 (`/admin/members`)
- `lib/admin-queries.ts` `listAllMembers` 확장: 검색(nickname)·필터(전체/신규/운영자/제재)·정렬·페이지네이션 + `suspended_at` 반환.
- 페이지: 요약 통계 3(전체·주간활성·제재) + 검색/필터칩/정렬 + 상태 배지(운영자/제재/신규) + 행 → `/admin/members/[id]`.
- `RefreshTagsButton`을 회원 목록(또는 상세) 헤더로 이동.

### Phase 2 — 운영 액션 (`_actions/admin-users.ts`, requireAdmin)
- `adminSuspendUser(id, reason)` / `adminUnsuspendUser(id)` — `suspended_at` set/clear.
- `adminSetAdmin(id, v)` — 운영자 토글. **가드: 본인·마지막 운영자 강등 금지.**

### Phase 3 — 상세 콘솔 (`/admin/members/[id]`)
- 기존 `/admin/recommend` `DebuggerBody`를 id 기반으로 이전(프로필·태그·분포·추천점수 그대로).
- **+ 활동 타임라인**: `lib/admin/user-activity.ts` — `user_events` + 거래(`payments`/`reviews`/`party_participants`) 시간순 merge.
- **+ 운영 액션 바**: 상태 배지 + 제재/운영자/봇 버튼.
- `/admin/recommend` → `/admin/members`로 **리다이렉트**(기존 링크 호환). AdminNav에서 recommend 탭 제거, `members` active 유지.

### 영향 받는 파일
- 신규: `app/admin/members/[id]/page.tsx`, `_actions/admin-users.ts`, `lib/admin/user-activity.ts`, 마이그레이션 `2026..._admin_user_mgmt.sql`
- 수정: `app/admin/members/page.tsx`, `lib/admin-queries.ts`, `app/admin/_components/nav.tsx`(탭 정리), `app/admin/recommend/page.tsx`(→리다이렉트)
- 이전: `/admin/recommend`의 콘솔 로직 → `[id]`
