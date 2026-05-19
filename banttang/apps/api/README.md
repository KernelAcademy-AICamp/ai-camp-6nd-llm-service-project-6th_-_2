# 반띵 FastAPI 보조 서버

Supabase에서 처리하기 어려운 작업만 담당하는 보조 서버. 자세한 경계는 루트 [CLAUDE.md](../../CLAUDE.md)의 §1 참고.

## 개발

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp ../../.env.example .env

uvicorn app.main:app --reload --port 8000
```

## 테스트

```bash
pytest
ruff check .
mypy app
```

## 디렉터리

```
app/
├── core/        # config, supabase admin client 등
├── routers/    # HTTP 라우터 (얇게 유지)
├── services/   # 외부 API 호출 (CLOVA, 알림톡, Toss, Redis 락 등)
└── workers/    # APScheduler 백그라운드 작업 (혜택 크롤러 등)
tests/
```
