// 파티 상태 전이. FastAPI 대신 Next.js 자체 API 라우트(/api/parties/[id]/complete) 사용.
// 단순 상태 전이 + 시스템 메시지 + 알림은 Supabase 직접으로 충분 (CLAUDE.md 원칙).
//
// accessToken은 시그니처 호환을 위해 받지만 실제로는 쿠키 세션을 사용한다.

interface CompletePartyInput {
  partyId: string;
  accessToken?: string;
}

export async function completeParty({
  partyId,
}: CompletePartyInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`/api/parties/${partyId}/complete`, {
    method: "POST",
  });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || !j.ok) {
    throw new Error(j.error ?? `거래 완료 처리 실패 (${res.status})`);
  }
  return { ok: true };
}
