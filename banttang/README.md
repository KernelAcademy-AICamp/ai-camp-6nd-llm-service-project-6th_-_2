# 반띵 (Banttang)

> 위치 기반 1인 가구 공동구매 매칭 서비스

같은 구매 목적을 가진 1인 가구를 위치 기반으로 매칭해 온/오프라인 구매 과정의 비용·잉여물·스트레스를 해소합니다.

자세한 설계 컨텍스트는 [CLAUDE.md](./CLAUDE.md)를 참고하세요.

## 모노레포 구조

```
banttang/
├── apps/
│   ├── web/        # Next.js 14 (App Router) + TS + Tailwind + shadcn/ui
│   └── api/        # FastAPI (Python 3.11) — OCR, 알림톡, 결제 콜백 등 보조 서버
├── packages/
│   └── shared/     # Pydantic ↔ TS 공통 타입
└── supabase/
    ├── migrations/ # SQL 마이그레이션 (대시보드 직접 수정 금지)
    └── seed.sql
```

## 빠른 시작

### 1. 사전 준비
- Node.js ≥ 20
- Python ≥ 3.11
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- (선택) Redis — 선착순 락/캐시 테스트 시

### 2. 환경 변수
```bash
cp .env.example .env.local      # 웹용
cp .env.example apps/api/.env   # FastAPI용 (서비스 롤 키 등)
```

### 3. 의존성 설치
```bash
npm install                              # web 워크스페이스
cd apps/api && pip install -e ".[dev]"   # FastAPI
```

### 4. Supabase 로컬 실행
```bash
supabase start
supabase db reset                        # 마이그레이션 적용 + 시드
```

### 5. 개발 서버
```bash
npm run dev:web      # http://localhost:3000
npm run dev:api      # http://localhost:8000
```

## 핵심 원칙 (CLAUDE.md 요약)

1. **Supabase 우선, FastAPI는 필요할 때만** — 단순 CRUD/인증/채팅/Storage는 Next.js → Supabase 직접 호출.
2. **권한은 RLS로** — `if user.id == post.author_id` 같은 분산 체크 금지.
3. **플랫폼은 돈을 보관하지 않는다** — 영수증 OCR + Claude 검증으로 거래만 인증.
4. **위치는 PostGIS** — `geography(POINT)` + `ST_DWithin`.

## 라이선스

추후 결정.
