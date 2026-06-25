-- ============================================================================
-- 반띵 — 커뮤니티 댓글 답글(대댓글) 지원
-- Version: 1.0.0
-- ============================================================================
--
-- community_comments 에 parent_id 추가 (자기참조). NULL이면 최상위 댓글,
-- 값이 있으면 해당 댓글에 대한 답글. UI는 1단계 깊이만 사용한다(답글의 답글도
-- 같은 최상위 부모에 매단다).
--
-- RLS는 기존 정책 그대로 적용된다(parent_id는 접근 제어와 무관).
-- comment_count 트리거도 그대로 — 답글도 1개의 댓글로 카운트된다.
-- ============================================================================

ALTER TABLE community_comments
    ADD COLUMN IF NOT EXISTS parent_id uuid
    REFERENCES community_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_community_comments_parent
    ON community_comments(parent_id);

COMMENT ON COLUMN community_comments.parent_id IS '답글 대상 댓글 id. NULL이면 최상위 댓글.';

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
