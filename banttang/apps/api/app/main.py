"""반띵 FastAPI 진입점.

이 서버는 Supabase로 처리하기 어려운 작업만 담당한다.
- 영수증 OCR + Claude 검증
- 카카오 알림톡 발송
- 선착순 매칭의 동시성 제어 (Redis 락)
- 결제 PG 콜백 수신
- 혜택 정보 크롤링 스케줄링
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import health, matching, ocr, payments


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # TODO: APScheduler / Redis 풀 초기화 위치
    yield


app = FastAPI(
    title="반띵 API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(ocr.router, prefix="/ocr", tags=["ocr"])
app.include_router(matching.router, prefix="/matching", tags=["matching"])
app.include_router(payments.router, prefix="/payments", tags=["payments"])
