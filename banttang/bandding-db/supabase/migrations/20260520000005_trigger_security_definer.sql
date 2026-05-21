-- ============================================================================
-- 트리거 함수에 SECURITY DEFINER 부여 — 비-호스트 참여자의 INSERT가 일으키는
-- 마감 전이(UPDATE parties)와 chat_rooms INSERT가 RLS로 무음 실패하는 문제 수정.
--
-- 배경:
--   - parties_update_host: host_id = auth.uid() — 호스트만 UPDATE 가능
--   - chat_rooms: INSERT 정책 없음 — RLS 활성 상태에서는 누구도 INSERT 불가
--   - 트리거가 SECURITY INVOKER(default)면 caller(=참여자) 권한으로 실행 → 위 두 작업 모두 차단
--
-- 해결: 함수에 SECURITY DEFINER + search_path 고정으로 정의자(슈퍼유저) 권한 사용.
-- ============================================================================

ALTER FUNCTION on_participant_approved()
    SECURITY DEFINER
    SET search_path = public;

ALTER FUNCTION on_party_created()
    SECURITY DEFINER
    SET search_path = public;

ALTER FUNCTION on_party_completed()
    SECURITY DEFINER
    SET search_path = public;

ALTER FUNCTION on_review_inserted()
    SECURITY DEFINER
    SET search_path = public;
