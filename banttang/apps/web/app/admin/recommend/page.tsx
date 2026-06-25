// 추천·성향 콘솔은 회원 상세(/admin/members/[id])로 흡수됨.
// 기존 링크·북마크(?u=닉네임) 호환용 리다이렉트.

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function RecommendRedirect({ searchParams }: { searchParams: { u?: string } }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  const handle = (searchParams.u ?? "").trim();
  if (handle) {
    const { data } = await createAdminClient()
      .from("profiles")
      .select("id")
      .eq("nickname", handle)
      .maybeSingle();
    if (data?.id) redirect(`/admin/members/${data.id}`);
  }
  redirect("/admin/members");
}
