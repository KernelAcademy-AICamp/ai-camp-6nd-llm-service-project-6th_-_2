import { createClient } from "@supabase/supabase-js";

// secret 키 권한 클라이언트 — RLS를 우회한다.
// **서버 코드에서만 import** (Server Component / Server Action / Route Handler).
// 클라이언트 컴포넌트에서 import하면 secret이 번들에 섞임 — Next.js가 빌드 시점에 막아주지만
// 안전을 위해 이 파일은 절대 "use client" 파일에서 import 금지.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("Supabase admin env missing (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)");
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
