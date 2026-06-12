import { cookies } from "next/headers";
import { getServiceClient } from "./supabase/admin";
import { createClient as createSsrClient } from "./supabase/server";

export const COOKIE_NAME = "banttang_user_id";
export const ADDRESS_COOKIE = "banttang_address";
export const ADDRESS_COORDS_COOKIE = "banttang_address_coords";

export type CurrentUser = {
  id: string;
  nickname: string;
  level: "dandelion" | "tree" | "king";
  gender: "female" | "male" | "prefer_not_to_say";
  neighborhood_id: string | null;
  transaction_count: number;
  good_review_count: number;
  bad_review_count: number;
  is_admin: boolean;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // 커스텀 쿠키 우선, 없으면 Supabase 세션 폴백으로 신원 해소.
  // /login(login-form, 세션만 세팅)처럼 세션만 있는 진입도 인식되게 통합.
  // 로그아웃은 세션·커스텀 쿠키를 모두 정리하므로 폴백이 유령 로그인을 만들지 않는다.
  const id = await getAuthedUserId();
  if (!id) return null;
  const sb = getServiceClient();
  const { data } = await sb
    .from("profiles")
    .select(
      "id, nickname, level, gender, neighborhood_id, transaction_count, good_review_count, bad_review_count, is_admin",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as CurrentUser | null) ?? null;
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}

// 서버 액션/라우트에서 "로그인한 유저 id"만 필요할 때 쓰는 단일 신원 소스.
// 이 앱은 커스텀 쿠키(banttang_user_id)와 Supabase 세션(sb-*)을 병행하는데,
// 둘 중 하나만 있어도(가입 직후/세션 만료 등) 동작하도록 커스텀 쿠키 우선 + 세션 폴백.
// 커스텀 쿠키는 서버에서만 httpOnly로 세팅하므로 신뢰 가능.
export async function getAuthedUserId(): Promise<string | null> {
  const fromCookie = cookies().get(COOKIE_NAME)?.value;
  if (fromCookie) return fromCookie;
  try {
    const ssr = createSsrClient();
    const {
      data: { user },
    } = await ssr.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// 슈퍼 계정 전용. is_admin이 아니면 UNAUTHORIZED로 막는다.
// (페이지에서는 catch 후 notFound()/redirect로 처리)
export async function requireAdmin(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u || !u.is_admin) throw new Error("FORBIDDEN");
  return u;
}
