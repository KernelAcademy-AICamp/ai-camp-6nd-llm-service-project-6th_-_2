// 파티 상태 전이 FastAPI 호출.
// parties.status 변경은 RLS UPDATE 정책으로도 가능하지만, 영수증 검증 완료 조건이나
// 추후 정산 알림톡 발송 등 부수 작업이 묶여 있어 서버 측 라우터를 거친다.

import { fastApiFetch } from "./client";
import type { Party } from "@/lib/types/domain";

interface CompletePartyInput {
  partyId: string;
  accessToken: string;
}

export async function completeParty({
  partyId,
  accessToken,
}: CompletePartyInput): Promise<Party> {
  return await fastApiFetch<Party>(`/parties/${partyId}/complete`, {
    method: "POST",
    accessToken,
  });
}
