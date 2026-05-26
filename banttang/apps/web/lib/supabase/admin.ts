import { createClient } from "@supabase/supabase-js";

// secret 키 권한 클라이언트 — RLS를 우회한다.
// **서버 코드에서만 import** (Server Component / Server Action / Route Handler).
// 클라이언트 컴포넌트에서 import 금지: secret이 번들에 섞일 위험.

let cached: any = null;

function build(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      "Supabase admin env missing (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)",
    );
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// soorimoo 기존 코드 호환 — 캐시 싱글톤
export function getServiceClient(): any {
  if (cached) return cached;
  cached = build();
  return cached;
}

// rin 코드 호환 — 같은 싱글톤 재사용
export function createAdminClient(): any {
  return getServiceClient();
}
