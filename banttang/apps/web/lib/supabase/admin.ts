import { createClient } from "@supabase/supabase-js";

// 서버 전용. RLS를 우회하는 service-role 키 (sb_secret_...).
// 데모용으로 시드 사용자 컨텍스트를 쿠키로 받아 행동 주체를 식별.
// 데모 단계라 generated types 안 쓰고 any로 둠. 정식 도입 시 createClient<Database>로 교체.
let cached: any = null;

export function getServiceClient(): any {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("Supabase URL 또는 SUPABASE_SECRET_KEY 누락");
  }
  cached = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
