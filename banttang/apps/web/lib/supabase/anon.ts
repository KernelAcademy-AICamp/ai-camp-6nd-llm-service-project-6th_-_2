import { createClient } from "@supabase/supabase-js";

// 서버 라우트에서 publishable 키로 호출할 때 쓰는 클라이언트.
// signInWithPassword 같은 사용자 인증 흐름에 사용.
let cached: any = null;

export function getAnonClient(): any {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) throw new Error("Supabase URL/PUBLISHABLE_KEY 누락");
  cached = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
