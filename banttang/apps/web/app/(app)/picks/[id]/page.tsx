import { notFound } from "next/navigation";
import { getDemoPick, isDemoId } from "@/lib/demo-data";
import { PICK_GROUPS } from "@/lib/grocery-picks";
import { getServiceClient } from "@/lib/supabase/admin";
import type { PickGroup } from "@/lib/grocery-picks";
import { PickDetailClient, type PickDetail } from "./PickDetailClient";

export const dynamic = "force-dynamic";

export default async function PickDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;

  let detail: PickDetail | null = null;

  if (isDemoId(id)) {
    const demo = getDemoPick(id);
    if (!demo) notFound();
    detail = {
      id: demo.id,
      group: demo.group,
      groupLabel: groupLabel(demo.group),
      title: demo.title,
      pricePerPerson: demo.pricePerPerson,
      maxMembers: demo.maxMembers,
      occupied: 0,
      image: demo.image,
      reason: demo.reason,
      sourceUrl: demo.sourceUrl ?? null,
      sourceLabel: demo.sourceLabel ?? null,
      isDemo: true,
    };
  } else {
    // 실제 AI 추천 방 — parties 테이블에서 조회 (is_ai_pick=true).
    const sb = getServiceClient();
    const { data: raw } = await sb
      .from("v_parties_with_stats")
      .select(
        "id, store_name, price_per_person, max_participants, pick_group, external_image_url, status",
      )
      .eq("id", id)
      .maybeSingle();
    if (!raw) notFound();
    const data = raw as {
      id: string;
      store_name: string;
      price_per_person: number;
      max_participants: number;
      pick_group: string | null;
      external_image_url: string | null;
      status: string;
    };
    const { data: parts } = await sb
      .from("party_participants")
      .select("status")
      .eq("party_id", id);
    const occupied = ((parts ?? []) as { status: string }[]).filter(
      (p) => p.status === "approved" || p.status === "pending",
    ).length;
    const group = (data.pick_group ?? "health") as PickGroup;
    detail = {
      id: data.id,
      group,
      groupLabel: groupLabel(group),
      title: data.store_name,
      pricePerPerson: data.price_per_person,
      maxMembers: data.max_participants,
      occupied,
      image: data.external_image_url ?? "",
      reason: "AI가 동네 데이터를 분석해 추천한 상품이에요.",
      sourceUrl: null,
      sourceLabel: null,
      isDemo: false,
    };
  }

  return <PickDetailClient detail={detail} />;
}

function groupLabel(g: PickGroup): string {
  return PICK_GROUPS.find((x) => x.key === g)?.label ?? "기타";
}
