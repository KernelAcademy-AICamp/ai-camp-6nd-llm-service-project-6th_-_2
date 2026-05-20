# CLAUDE.md

이 문서는 Claude Code가 반띵 프로젝트에서 작업할 때 참조하는 컨텍스트입니다. 새 세션이 시작될 때마다 먼저 읽어주세요.

> 📄 **제품 요구사항(PRD)은 [`docs/PRD.md`](docs/PRD.md) 참고.** 기능·플로우·KPI 같은 제품 레벨 명세가 필요할 때는 이 문서가 아니라 PRD를 우선 본다.

## 프로젝트 개요

**반띵 (가제)** — 위치 기반 1인 가구 공동구매 매칭 서비스

### 한 줄 정의
같은 구매 목적을 가진 1인 가구를 위치 기반으로 매칭해 온/오프라인 구매 과정의 비용·잉여물·스트레스를 해소한다.

### 핵심 가설
1인 가구 장보기 불편의 1순위 원인은 **다인원 기준 최소주문금액·벌크 단위와 1인분 소비량 사이의 갭**이다. 같은 목적의 1인 가구를 모으면 합리적 소비가 가능해진다.

### 타깃
서울 관악구·동작구 고시원·원룸촌 거주 25–34세 1인 가구. 월 식비 30–50만 원대, 배달 주 2회 이상, 당근·번개장터 사용 경험 있음.

### 거래 유형
1. **장보기 소분** — 오프라인 마트, 벌크 식료품 나눔
2. **음식 배달 같이 시키기** — 최소주문금액 분담 (최대 1km)
3. ~~정기 구독 소분~~ (보류)

## 기술 스택

**아키텍처: Supabase 메인 + FastAPI 보조 (하이브리드)**

### 프론트엔드
- **Next.js 14+ (App Router) + TypeScript** — PWA 설정 필수
- **Tailwind CSS + shadcn/ui**
- **Zustand** (클라이언트 상태) + **TanStack Query** (FastAPI 호출 캐싱)
- **Kakao Map JavaScript SDK** — 지도, 거리 계산, 안전장소 추천
- 배포: **Vercel**

### Supabase (메인 백엔드)
다음 영역은 모두 Supabase에서 처리. Next.js 클라이언트에서 직접 호출.

- **Auth** — 카카오 OAuth. 본인인증(PASS/NICE)은 Phase 2로 보류.
- **PostgreSQL + PostGIS** — 위치 쿼리(`ST_DWithin`), 모든 도메인 데이터. 확장: `postgis`, `pg_cron`, `pg_trgm`.
- **Realtime 구독 대상** — `chat_messages`, `party_participants`, `parties`, `notifications`, `payments`, `receipts`
- **Storage 버킷** — `party-photos`(public), `receipts`(private, signed URL), `profile-images`(public, Phase 2)
- **RLS (Row Level Security)** — 권한 제어는 반드시 RLS 정책으로. 백엔드 코드 분산 금지. 헬퍼: `is_party_member`, `is_party_host`, `is_room_member` (`SECURITY DEFINER`로 RLS 재귀 방지).

### FastAPI (보조 서버)
무거운 작업·외부 연동만 담당. Next.js → FastAPI → Supabase 흐름.

- **Python 3.11 + FastAPI + Pydantic v2**
- **영수증 OCR + Claude 검증 파이프라인**
  - 1차: 네이버 CLOVA OCR
  - 2차: Claude Sonnet 4.6으로 금액/상호/날짜 합리성 판단
- **카카오 알림톡 발송** (비즈뿌리오 또는 알리고)
- **혜택정보 크롤링 스케줄러** (청년몽땅정보통 등) — APScheduler 또는 ARQ
- 배포: **Railway**

> 참고: 결제는 카카오톡 송금(외부)이라 **PG 콜백 수신 라우터는 없다.** 모집 마감/채팅방 오픈도 DB trigger로 처리하므로 별도 **Redis 분산 락은 사용하지 않는다.** 추후 진짜로 필요해지면 RFC로 재검토.

### 인프라
- **Sentry** — 에러 추적
- **PostHog** — 제품 분석 (북극성 지표 트래킹)
- ~~Redis~~ — 현재 미사용. 동시성/마감 처리는 DB trigger + `pg_cron`이 담당.

## 핵심 설계 원칙

### 1. Supabase 우선, FastAPI는 필요할 때만
단순 CRUD, 인증, 채팅, 파일 업로드는 Next.js → Supabase 직접 호출. FastAPI는 다음 경우에만 사용:
- 외부 API 연동이 복잡할 때 (PG, 알림톡, OCR)
- 동시성 제어가 필요할 때 (선착순)
- AI 파이프라인 (Claude 호출 + 후처리)
- 스케줄 작업 (크롤링)

새 기능 추가 시 "이게 정말 FastAPI에 있어야 하나?"를 먼저 자문할 것.

### 2. 권한은 RLS로
백엔드 코드 곳곳에 `if user.id == post.author_id:` 같은 체크 흩뿌리지 말 것. PostgreSQL RLS 정책으로 선언. 예: "모집글 참여자만 채팅 메시지를 SELECT 할 수 있다."

### 3. 결제는 "금액 인증"만
**플랫폼은 돈을 보관하지 않는다.** 송금은 사용자끼리. 우리는:
- 영수증 OCR + Claude로 실제 결제 금액 검증
- 거래 히스토리 DB 기록
- 분쟁 시 운영자 개입 흐름

전자금융거래법상 에스크로는 라이선스 이슈가 있어 MVP에선 제외. PMF 검증 후 재검토.

### 4. 푸시 알림은 카카오 알림톡 + 웹푸시
- **알림톡**: 매칭 성공, 정원 마감, 거래 1시간 전, 거래완료 확인 (필수 시나리오만)
- **웹푸시 (Web Push API)**: PWA 설치자 대상 보조 채널, 비용 절감
- 알림톡 템플릿은 사전 승인 필요(3–5일) — 1주차에 신청

### 5. 위치는 PostGIS로
lat/lng 컬럼만 두고 애플리케이션 레벨에서 거리 계산하지 말 것. `geography(POINT)` 타입 + GIST 인덱스 + `ST_DWithin` 사용.

## 도메인 모델

정식 정의는 `bandding-db/`. 여기서는 빠른 참조용 요약만.

- **profiles** — Supabase Auth(`auth.users`) 연동 프로필. 신뢰점수 컬럼(`good/bad/total_review_count`, `transaction_count`, `level`)을 trigger로 갱신.
- **parties** — 모집글. **단일 테이블 + `category` enum(`delivery` Phase 1 / `grocery` Phase 2)**. 위치(`geography`), 정원, 마감, 상태(`recruiting/closed/in_progress/completed/cancelled`).
- **party_participants** — 모집글-참여자 매핑. **호스트도 row를 가지며 `is_host=true`로 구분.**
- **chat_rooms / chat_messages** — 모집글당 1채팅방. Realtime 구독.
- **receipts** — 영수증 이미지 + OCR/검증 상태.
- **payments** — 송금 기록. `pending → sent_by_payer → confirmed_by_receiver`.
- **reviews** — 거래 후 상대방 평가. `rating: good/bad`로 신뢰점수 trigger를 발화.
- **neighborhoods / pickup_locations** — 베타 동네, 안전 픽업 장소 시드.
- **notifications** — 인앱 알림.

### 스키마 결정사항 (변경 금지, 변경 시 RFC)

1. `parties` 단일 테이블 + `category` enum — Phase 1·2 로직 100% 재사용.
2. 호스트도 `party_participants`에 들어간다 — 호스트/참여자 분기 로직 제거 목적.
3. **신뢰점수는 컬럼 + trigger 갱신.** 매번 뷰로 계산하지 말 것. 등급은 `compute_user_level(tx, good, total)`로 단일화 (`dandelion / tree / king`).
4. **모집 마감·채팅방 오픈은 trigger.** `party_participants.status='approved'` INSERT/UPDATE에서 정원 체크 → `parties.status='closed'` + `chat_rooms` 생성 + 시스템 메시지.
5. **상태 전이는 `pg_cron`.** 매 분 `transition_expired_parties()`가 신청 마감/거래 시각을 검사.
6. **홈 피드는 `v_parties_with_stats` 뷰 사용.** raw `parties` 직접 조회 금지.
7. ~~`benefit_articles`~~ — 아직 스키마 없음. 추가 시 별도 마이그레이션.

## 디렉터리 구조

```
banttang/
├── apps/
│   ├── web/                    # Next.js
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── supabase/      # 클라이언트, 서버 인스턴스
│   │   │   └── api/           # FastAPI 호출 래퍼
│   │   └── ...
│   └── api/                    # FastAPI
│       ├── app/
│       │   ├── routers/
│       │   ├── services/      # ocr, kakao_alimtalk 등
│       │   ├── workers/       # 크롤러, 스케줄러
│       │   └── core/          # config, supabase admin client
│       └── tests/
├── packages/
│   └── shared/                 # 공통 타입 (Pydantic ↔ TS)
├── bandding-db/                # DB 스키마 단일 소스 (마이그레이션·RLS·TS 타입·README)
│   ├── supabase/migrations/
│   ├── database.types.ts
│   └── README.md
├── supabase/                   # 로컬 Supabase CLI 설정 (config, seed)
│   ├── config.toml
│   ├── migrations/            # bandding-db에서 복사해 사용
│   └── seed.sql
├── docs/                       # PRD 등 제품 문서
└── CLAUDE.md
```

> **스키마 작업 시 진실의 원천은 `bandding-db/`.** `supabase/migrations/`는 로컬 실행용 복사본.

## 성공 지표 (6주 시점)

- **북극성 지표**: 주간 거래 성사율(모집글 → 정산 완료) **40% 이상**
- DAU/WAU ≥ 0.3
- 1인당 첫 거래까지 7일 이내
- NPS ≥ 30
- 인터뷰 10명 중 7명이 "단톡방·당근 대신 반띵 쓰겠다"

**실패 판단**: 거래 성사율 20% 미만 또는 재방문율 10% 미만 → 핵심 가설 재검증.

## 코딩 컨벤션

### 공통
- 모든 식별자(테이블, 컬럼, 변수)는 **snake_case** (TS 클라이언트에선 camelCase로 매핑)
- 시간은 모두 UTC로 저장, 표시 시 KST 변환
- 좌표는 `(latitude, longitude)` 순서 — 단, PostGIS POINT는 `(lng, lat)` 순서임에 주의

### TypeScript (Next.js)
- `any` 금지. Supabase 타입은 `supabase gen types typescript`로 자동 생성
- Server Component 기본, 인터랙션 필요할 때만 `"use client"`
- 환경변수는 `process.env.NEXT_PUBLIC_*` (클라이언트) / 서버 전용은 비공개

### Python (FastAPI)
- Pydantic v2 모델 필수, dict 반환 금지
- 모든 외부 API 호출은 `services/` 하위 모듈로 분리, 라우터에서 직접 호출 금지
- 비동기(`async def`) 기본, 동기 라이브러리는 `run_in_threadpool` 또는 별도 워커

### Git
- 브랜치: `feat/`, `fix/`, `chore/`, `docs/`
- 커밋: Conventional Commits (`feat: ...`, `fix: ...`)
- PR 머지 전 lint + type check + 최소한의 테스트 통과

## 보안 / 컴플라이언스 메모

- 본인인증 결과(성별, 생년월일)는 암호화 저장, 화면에는 가공된 값만 노출
- 위치는 정확한 좌표 대신 **모집 장소 좌표**만 공개. 사용자 홈 좌표는 비공개
- 영수증 이미지의 개인정보(카드번호 뒷자리 등)는 OCR 후 마스킹 처리
- 채팅 로그는 분쟁 대응 목적 외 접근 금지, 운영자 접근 로그 남길 것
- 사업자등록 + 통신판매업 신고 필요 여부 사전 확인 (단순 매칭은 비대상일 수 있음)

## 작업 시 Claude에게 부탁

1. **Supabase로 충분한 작업을 FastAPI로 옮기지 마세요.** 새 엔드포인트 만들기 전에 RLS + Supabase 클라이언트 직접 호출로 가능한지 먼저 검토.
2. **스키마 변경은 `bandding-db/supabase/migrations/`에 새 SQL 파일 추가로.** 대시보드 직접 수정 금지. 변경 후 `database.types.ts`도 같이 갱신.
3. **시크릿 키 노출 금지.** 환경변수는 `.env.local` (gitignore됨), 예시는 `.env.example`로.
4. **Claude API 호출 시 모델은 `claude-sonnet-4-6` 또는 최신 안정 버전 사용.** 비용 민감한 작업은 Haiku 검토.
5. **외부 API 응답은 항상 Pydantic으로 검증.** OCR·알림톡 응답 그대로 신뢰 금지.
6. **답변과 코드 주석은 한국어 우선**, 변수명·함수명은 영어.

## 보류·버린 아이디어 (다시 꺼내지 말 것)

- 절약 챌린지 → "혜택"으로 톤 전환
- 집주인용 운영관리 플랫폼
- 하우스메이트 매칭
- 빈 집 관리, 동행/안심귀가
- 무형 상품 공구(OTT 등)
- 구매 대행 서비스

다시 검토할 가치가 있다면 별도 RFC 문서로 제안해주세요.


## DB 스키마

테이블 구조, RLS 정책, 트리거는 `./bandding-db/`를 참고:
- 스키마 정의: `bandding-db/supabase/migrations/20260520000001_initial_schema.sql`
- RLS 정책: `bandding-db/supabase/migrations/20260520000002_rls_policies.sql`
- TS 타입: `bandding-db/database.types.ts`
- 설계 의도/규칙: `bandding-db/README.md`

Supabase 쿼리를 작성하거나 새 테이블/컬럼을 추가할 때는
반드시 위 파일들을 먼저 확인하고, 기존 네이밍/RLS 패턴을 따를 것.

## 자주 쓰는 패턴

- 홈 피드는 `v_parties_with_stats` 뷰 사용 (raw 테이블 직접 X)
- 신뢰점수는 컬럼 직접 읽기 (재계산 X — trigger가 갱신함)
- 채팅은 Realtime 구독, 필터는 `room_id=eq.${roomId}`
