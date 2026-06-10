"use server";

// 온보딩 맞춤 추천 선호도 저장 — profiles 본인 row 갱신 (RLS: profiles_update_own).
// 수집은 하지만 휘발되던 온보딩 선택(primary_usage / favorite_malls / favorite_categories)을
// DB에 영속화한다. 실패해도 온보딩 흐름은 막지 않는다(라우팅은 클라이언트가 계속 진행).

import { createClient as createServerClient } from "@/lib/supabase/server";
import type { PrimaryUsage } from "@/lib/types/domain";

const VALID_USAGE: PrimaryUsage[] = [
  "delivery_bulk",
  "delivery_min",
  "shopping_bulk",
  "shopping_min",
];

export type OnboardingPrefsInput = {
  primary_usage?: string | null;
  favorite_malls?: string[];
  favorite_categories?: string[];
};

export async function saveOnboarding(
  input: OnboardingPrefsInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) return { ok: false, error: "로그인이 필요해요." };

    // enum 위반 방지 — 알 수 없는 값은 null 로.
    const primary_usage =
      input.primary_usage && VALID_USAGE.includes(input.primary_usage as PrimaryUsage)
        ? (input.primary_usage as PrimaryUsage)
        : null;

    const { error } = await supabase
      .from("profiles")
      .update({
        primary_usage,
        favorite_malls: input.favorite_malls ?? [],
        favorite_categories: input.favorite_categories ?? [],
      })
      .eq("id", user.id);

    if (error) {
      console.error("[save-onboarding] profiles 갱신 실패:", error);
      return { ok: false, error: "선호도 저장에 실패했어요." };
    }
    return { ok: true };
  } catch (e) {
    console.error("[save-onboarding] 예외:", e);
    return { ok: false, error: e instanceof Error ? e.message : "저장 실패" };
  }
}
