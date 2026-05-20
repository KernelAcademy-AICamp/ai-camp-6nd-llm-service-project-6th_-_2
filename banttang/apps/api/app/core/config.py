"""환경 변수 로딩.

.env 파일은 apps/api/.env 또는 프로세스 환경에서 주입된다.
SUPABASE_SECRET_KEY 같은 비밀값은 절대 클라이언트에 노출 금지.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase (신규 키 체계: sb_publishable_... / sb_secret_...)
    supabase_url: str = Field(..., alias="NEXT_PUBLIC_SUPABASE_URL")
    supabase_secret_key: str = Field(..., alias="SUPABASE_SECRET_KEY")

    # Claude
    anthropic_api_key: str = Field(..., alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field("claude-sonnet-4-6", alias="ANTHROPIC_MODEL")

    # CLOVA OCR
    clova_ocr_secret: str | None = Field(None, alias="CLOVA_OCR_SECRET")
    clova_ocr_invoke_url: str | None = Field(None, alias="CLOVA_OCR_INVOKE_URL")

    # Redis
    redis_url: str = Field("redis://localhost:6379/0", alias="REDIS_URL")

    # CORS — Next.js 개발/배포 origin
    cors_allow_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
