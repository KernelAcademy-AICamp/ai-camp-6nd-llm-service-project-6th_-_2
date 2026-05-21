"""반띵 FastAPI 진입점.

이 서버는 Supabase로 처리하기 어려운 작업만 담당한다.
- 영수증 OCR + Claude 검증 (동기: 성공 시 receipts row INSERT)
- 파티 라이프사이클 (호스트 거래 완료 처리)
- 카카오 알림톡 발송 (예정)
- 혜택 정보 크롤링 스케줄링 (예정)

결제는 카카오톡 송금(외부)이라 PG 콜백 라우터는 없다.
모집 마감/채팅방 오픈은 DB trigger가 처리하므로 분산 락도 사용하지 않는다.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import health, matching, ocr, parties, payments


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
app.include_router(parties.router, prefix="/parties", tags=["parties"])
