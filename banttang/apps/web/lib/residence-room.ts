// 거주지(건물) 채팅방 — UI 시연용 목업 헬퍼.
// 실제 백엔드(rooms/members 테이블) 연동 전까지, 인원수는 건물명 기반
// 결정적(deterministic) 값으로 만들어 화면마다 흔들리지 않게 한다.
export function mockResidenceMemberCount(_residence: string): number {
  // 시연용 — 대화상대 10명으로 고정(헤더·커뮤니티 행·서랍 모두 동일).
  return 10;
}

// 입장 후 리스트에 보여줄 "최근 메시지" 미리보기 — 채팅방 시드 마지막 메시지와 동일.
export const MOCK_LAST_MESSAGE =
  "택배 보관함 또 꽉 찼어요 ㅠㅠ 찾아가실 분들 빨리 부탁드려요!";
export const MOCK_LAST_TIME = "오후 1:47";

// 입장 여부(목업) localStorage 키.
export function residenceJoinedKey(residence: string): string {
  return `residence-joined:${residence}`;
}

// 시연용 대화상대(나 제외, 9명) — 나 + 9명 = 총 10명. 실제 연동 시 멤버 쿼리로 교체.
export const RESIDENCE_OTHER_MEMBERS = [
  "초록세탁기",
  "햇살가득",
  "야근요정",
  "골목대장",
  "102호집사",
  "새벽러너",
  "민트초코러버",
  "앞집총각",
  "책읽는밤",
];
