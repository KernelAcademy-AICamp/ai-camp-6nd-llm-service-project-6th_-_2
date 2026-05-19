"""service_role 권한의 Supabase 클라이언트.

이 클라이언트는 RLS를 우회한다. 정말로 서버 사이드에서만 호출.
사용자 토큰 검증·신뢰가 끝난 흐름에서만 사용할 것.
"""
from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from app.core.config import settings


@lru_cache(maxsize=1)
def get_admin_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
