// Pydantic 모델과 1:1로 맞추는 도메인 타입.
// FastAPI 응답 contract를 TS 측에서 검증할 때 사용.

export type PostKind = "grocery" | "delivery";

export type PostStatus =
  | "open"        // 모집 중
  | "matched"     // 정원 마감, 거래 대기
  | "settling"    // 영수증 검증 중
  | "completed"   // 거래 완료
  | "cancelled";  // 취소

export interface Coord {
  latitude: number;
  longitude: number;
}

export interface PostSummary {
  id: string;
  kind: PostKind;
  title: string;
  meetingPoint: Coord;
  capacity: number;
  joinedCount: number;
  status: PostStatus;
  deadlineAt: string; // ISO 8601 UTC
}
