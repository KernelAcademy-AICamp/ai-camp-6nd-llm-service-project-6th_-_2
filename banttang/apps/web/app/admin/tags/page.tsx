// 성향 태그는 추천 디버거와 합쳐졌다(/admin/recommend). 기존 링크·북마크 호환용 리다이렉트.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function TagsRedirect({ searchParams }: { searchParams: { u?: string } }) {
  const u = (searchParams.u ?? "").trim();
  redirect(u ? `/admin/recommend?u=${encodeURIComponent(u)}` : "/admin/recommend");
}
