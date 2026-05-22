import { cookies } from "next/headers";
import { getServiceClient } from "./supabase/admin";

export const COOKIE_NAME = "banttang_user_id";
export const ADDRESS_COOKIE = "banttang_address";
export const ADDRESS_COORDS_COOKIE = "banttang_address_coords";

export type CurrentUser = {
  id: string;
  nickname: string;
  level: "dandelion" | "tree" | "king";
  gender: "female" | "male" | "prefer_not_to_say";
  transaction_count: number;
  good_review_count: number;
  bad_review_count: number;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const id = cookies().get(COOKIE_NAME)?.value;
  if (!id) return null;
  const sb = getServiceClient();
  const { data } = await sb
    .from("profiles")
    .select("id, nickname, level, gender, transaction_count, good_review_count, bad_review_count")
    .eq("id", id)
    .maybeSingle();
  return (data as CurrentUser | null) ?? null;
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}
