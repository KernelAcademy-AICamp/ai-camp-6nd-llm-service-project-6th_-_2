# CLAUDE.md

이 문서는 Claude Code가 반띵 프로젝트에서 작업할 때 참조하는 컨텍스트입니다. 새 세션이 시작될 때마다 먼저 읽어주세요.

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

- **Auth** — 카카오 OAuth, 본인인증(PASS/NICE 연동)
- **PostgreSQL + PostGIS** — 위치 쿼리(`ST_DWithin`), 모든 도메인 데이터
- **Realtime** — 채팅 메시지, 모집글 상태 변경 구독
- **Storage** — 영수증 이미지, 프로필 사진
- **RLS (Row Level Security)** — 권한 제어는 반드시 RLS 정책으로. 백엔드 코드 분산 금지

### FastAPI (보조 서버)
무거운 작업·외부 연동만 담당. Next.js → FastAPI → Supabase 흐름.

- **Python 3.11 + FastAPI + Pydantic v2**
- **영수증 OCR + Claude 검증 파이프라인**
  - 1차: 네이버 CLOVA OCR
  - 2차: Claude Sonnet 4.6으로 금액/상호/날짜 합리성 판단
- **카카오 알림톡 발송** (비즈뿌리오 또는 알리고)
- **선착순 매칭의 동시성 제어** — Redis 분산 락
- **혜택정보 크롤링 스케줄러** (청년몽땅정보통 등) — APScheduler 또는 ARQ
- **결제 PG 콜백 수신** (토스페이먼츠/포트원)
- 배포: **Railway**

### 인프라
- **Redis** (Railway) — 선착순 락, 캐시
- **Sentry** — 에러 추적
- **PostHog** — 제품 분석 (북극성 지표 트래킹)

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

## 도메인 모델 (초안)

핵심 엔티티만 표기. 세부 컬럼은 마이그레이션 작성 시 확정.

- **users** — Supabase Auth 연동, 프로필, 성별(본인인증 결과), 신뢰 점수
- **posts** — 모집글. 유형(grocery/delivery), 위치(geography), 정원, 마감, 상태
- **post_participants** — 모집글-참여자 매핑, 호스트/멤버 구분
- **chat_messages** — 모집글당 1채팅방, Realtime 구독 대상
- **transactions** — 거래 기록, 영수증 이미지 URL, 인증 상태
- **reviews** — 거래 후 상대방·상품 리뷰
- **benefit_articles** — 크롤링한 1인 가구 혜택 정보

## 디렉터리 구조 제안

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
│       │   ├── services/      # ocr, kakao_alimtalk, payment 등
│       │   ├── workers/       # 크롤러, 스케줄러
│       │   └── core/          # config, supabase admin client
│       └── tests/
├── packages/
│   └── shared/                 # 공통 타입 (Pydantic ↔ TS)
├── supabase/
│   ├── migrations/            # SQL 마이그레이션
│   ├── seed.sql
│   └── functions/             # Edge Functions (사용 시)
└── CLAUDE.md
```

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
2. **마이그레이션은 항상 `supabase/migrations/` 하위 SQL로.** 대시보드 직접 수정 금지.
3. **시크릿 키 노출 금지.** 환경변수는 `.env.local` (gitignore됨), 예시는 `.env.example`로.
4. **Claude API 호출 시 모델은 `claude-sonnet-4-6` 또는 최신 안정 버전 사용.** 비용 민감한 작업은 Haiku 검토.
5. **외부 API 응답은 항상 Pydantic으로 검증.** PG 콜백·OCR 결과 그대로 신뢰 금지.
6. **답변과 코드 주석은 한국어 우선**, 변수명·함수명은 영어.

## 보류·버린 아이디어 (다시 꺼내지 말 것)

- 절약 챌린지 → "혜택"으로 톤 전환
- 집주인용 운영관리 플랫폼
- 하우스메이트 매칭
- 빈 집 관리, 동행/안심귀가
- 무형 상품 공구(OTT 등)
- 구매 대행 서비스

다시 검토할 가치가 있다면 별도 RFC 문서로 제안해주세요.
