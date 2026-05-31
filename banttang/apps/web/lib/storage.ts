// Supabase Storage path → 공개 URL 변환 헬퍼.
//
// party_photos.storage_path 형식:
//   - "{party_id}/{uuid}.{ext}"   → public bucket 'party-photos'에서 해석
//   - "https://..."                → 외부 URL (예: 도미노 등 시드 데이터). 그대로 사용.
//
// 클라이언트/서버 양쪽에서 호출 가능 (process.env.NEXT_PUBLIC_*만 참조).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function partyPhotoUrl(storagePath: string): string {
  if (!storagePath) return "";
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  return `${SUPABASE_URL}/storage/v1/object/public/party-photos/${storagePath}`;
}
