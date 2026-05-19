import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Component / Route Handler에서 사용하는 Supabase 인스턴스.
// 쿠키 기반 세션을 그대로 이어 받기 위해 next/headers의 cookies()를 주입.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component에서 set 호출 시 발생하는 read-only 오류는 무시.
            // 미들웨어에서 갱신하면 됨.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // 위와 동일
          }
        },
      },
    },
  );
}
