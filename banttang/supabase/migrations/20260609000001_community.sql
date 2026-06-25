-- ============================================================================
-- 반띵 — 동네 커뮤니티 (게시판)
-- Version: 1.0.0
-- ============================================================================
--
-- 핵심 규칙
-- ---------
-- 같은 동네(neighborhoods.id = profiles.neighborhood_id)에 속한 유저끼리만
-- 글/댓글을 읽고 쓸 수 있다. neighborhoods는 (city, district, name)이 UNIQUE이므로
-- "시·구·동이 모두 같은 유저" == "같은 neighborhood_id" 와 동치다.
--
-- 권한은 RLS로 선언 (is_my_neighborhood SECURITY DEFINER 헬퍼).
-- 좋아요/댓글 수는 컬럼 + trigger로 갱신 (조회마다 count 금지).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. ENUM — 글 카테고리
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE community_category AS ENUM (
        'free',      -- 잡담
        'question',  -- 질문
        'share',     -- 나눔
        'info',      -- 정보
        'meetup'     -- 모임
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

-- 1.1 community_posts — 동네 게시글
CREATE TABLE IF NOT EXISTS community_posts (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    neighborhood_id uuid NOT NULL REFERENCES neighborhoods(id) ON DELETE CASCADE,
    author_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category        community_category NOT NULL DEFAULT 'free',
    title           text NOT NULL,
    body            text NOT NULL,
    image_paths     text[] NOT NULL DEFAULT '{}',     -- community-photos 버킷 경로
    like_count      int  NOT NULL DEFAULT 0,
    comment_count   int  NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT community_title_length CHECK (char_length(title) BETWEEN 1 AND 100),
    CONSTRAINT community_body_length  CHECK (char_length(body)  BETWEEN 1 AND 2000),
    CONSTRAINT community_image_max    CHECK (array_length(image_paths, 1) IS NULL OR array_length(image_paths, 1) <= 5)
);

CREATE INDEX IF NOT EXISTS idx_community_posts_neighborhood
    ON community_posts(neighborhood_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_author
    ON community_posts(author_id);

COMMENT ON TABLE community_posts IS '동네 커뮤니티 게시글. 같은 neighborhood_id 유저끼리만 접근.';

-- 1.2 community_comments — 댓글
CREATE TABLE IF NOT EXISTS community_comments (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id     uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    author_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    body        text NOT NULL,
    like_count  int  NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT community_comment_length CHECK (char_length(body) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post
    ON community_comments(post_id, created_at ASC);

COMMENT ON TABLE community_comments IS '커뮤니티 댓글.';

-- 1.3 community_post_likes — 글 좋아요 (유저당 1회)
CREATE TABLE IF NOT EXISTS community_post_likes (
    post_id     uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

-- 1.4 community_comment_likes — 댓글 좋아요 (유저당 1회)
CREATE TABLE IF NOT EXISTS community_comment_likes (
    comment_id  uuid NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (comment_id, user_id)
);


-- ----------------------------------------------------------------------------
-- 2. FUNCTIONS & TRIGGERS — 카운터 갱신
-- ----------------------------------------------------------------------------

-- updated_at 자동 갱신 (기존 set_updated_at 재사용)
DROP TRIGGER IF EXISTS trg_community_posts_updated ON community_posts;
CREATE TRIGGER trg_community_posts_updated
    BEFORE UPDATE ON community_posts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_community_comments_updated ON community_comments;
CREATE TRIGGER trg_community_comments_updated
    BEFORE UPDATE ON community_comments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 댓글 수 갱신
CREATE OR REPLACE FUNCTION community_sync_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE community_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_comment_count ON community_comments;
CREATE TRIGGER trg_community_comment_count
    AFTER INSERT OR DELETE ON community_comments
    FOR EACH ROW EXECUTE FUNCTION community_sync_comment_count();

-- 글 좋아요 수 갱신
CREATE OR REPLACE FUNCTION community_sync_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE community_posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE community_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_post_like_count ON community_post_likes;
CREATE TRIGGER trg_community_post_like_count
    AFTER INSERT OR DELETE ON community_post_likes
    FOR EACH ROW EXECUTE FUNCTION community_sync_post_like_count();

-- 댓글 좋아요 수 갱신
CREATE OR REPLACE FUNCTION community_sync_comment_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE community_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE community_comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_comment_like_count ON community_comment_likes;
CREATE TRIGGER trg_community_comment_like_count
    AFTER INSERT OR DELETE ON community_comment_likes
    FOR EACH ROW EXECUTE FUNCTION community_sync_comment_like_count();


-- ----------------------------------------------------------------------------
-- 3. RLS — 같은 동네 유저만 읽기/쓰기
-- ----------------------------------------------------------------------------

-- 현재 유저가 해당 동네 소속인지 (SECURITY DEFINER로 RLS 재귀 방지)
CREATE OR REPLACE FUNCTION is_my_neighborhood(_neighborhood_id uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
         WHERE id = auth.uid()
           AND neighborhood_id = _neighborhood_id
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 현재 유저가 해당 글과 같은 동네인지 (댓글/좋아요 정책용)
CREATE OR REPLACE FUNCTION is_my_neighborhood_post(_post_id uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1
          FROM community_posts p
          JOIN profiles me ON me.id = auth.uid()
         WHERE p.id = _post_id
           AND p.neighborhood_id = me.neighborhood_id
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE community_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_likes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comment_likes  ENABLE ROW LEVEL SECURITY;

-- 3.1 community_posts
DROP POLICY IF EXISTS "community_posts_select_neighbor" ON community_posts;
CREATE POLICY "community_posts_select_neighbor"
    ON community_posts FOR SELECT
    USING (is_my_neighborhood(neighborhood_id));

DROP POLICY IF EXISTS "community_posts_insert_neighbor" ON community_posts;
CREATE POLICY "community_posts_insert_neighbor"
    ON community_posts FOR INSERT
    WITH CHECK (auth.uid() = author_id AND is_my_neighborhood(neighborhood_id));

DROP POLICY IF EXISTS "community_posts_update_own" ON community_posts;
CREATE POLICY "community_posts_update_own"
    ON community_posts FOR UPDATE
    USING (auth.uid() = author_id)
    WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "community_posts_delete_own" ON community_posts;
CREATE POLICY "community_posts_delete_own"
    ON community_posts FOR DELETE
    USING (auth.uid() = author_id);

-- 3.2 community_comments
DROP POLICY IF EXISTS "community_comments_select_neighbor" ON community_comments;
CREATE POLICY "community_comments_select_neighbor"
    ON community_comments FOR SELECT
    USING (is_my_neighborhood_post(post_id));

DROP POLICY IF EXISTS "community_comments_insert_neighbor" ON community_comments;
CREATE POLICY "community_comments_insert_neighbor"
    ON community_comments FOR INSERT
    WITH CHECK (auth.uid() = author_id AND is_my_neighborhood_post(post_id));

DROP POLICY IF EXISTS "community_comments_delete_own" ON community_comments;
CREATE POLICY "community_comments_delete_own"
    ON community_comments FOR DELETE
    USING (auth.uid() = author_id);

-- 3.3 community_post_likes
DROP POLICY IF EXISTS "community_post_likes_select_neighbor" ON community_post_likes;
CREATE POLICY "community_post_likes_select_neighbor"
    ON community_post_likes FOR SELECT
    USING (is_my_neighborhood_post(post_id));

DROP POLICY IF EXISTS "community_post_likes_insert_own" ON community_post_likes;
CREATE POLICY "community_post_likes_insert_own"
    ON community_post_likes FOR INSERT
    WITH CHECK (auth.uid() = user_id AND is_my_neighborhood_post(post_id));

DROP POLICY IF EXISTS "community_post_likes_delete_own" ON community_post_likes;
CREATE POLICY "community_post_likes_delete_own"
    ON community_post_likes FOR DELETE
    USING (auth.uid() = user_id);

-- 3.4 community_comment_likes
DROP POLICY IF EXISTS "community_comment_likes_select_own" ON community_comment_likes;
CREATE POLICY "community_comment_likes_select_own"
    ON community_comment_likes FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "community_comment_likes_insert_own" ON community_comment_likes;
CREATE POLICY "community_comment_likes_insert_own"
    ON community_comment_likes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "community_comment_likes_delete_own" ON community_comment_likes;
CREATE POLICY "community_comment_likes_delete_own"
    ON community_comment_likes FOR DELETE
    USING (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 4. STORAGE — community-photos 버킷
-- ----------------------------------------------------------------------------
-- ⚠️ 버킷 생성/정책은 일부러 이 마이그레이션에 넣지 않는다.
--    Supabase SQL Editor의 실행 역할(postgres)은 storage.buckets(소유자
--    supabase_storage_admin) / storage.objects 에 대한 INSERT·CREATE POLICY 가
--    권한·소유권 문제로 실패할 수 있고, 단일 트랜잭션이라 그 한 줄이
--    위의 테이블 생성까지 통째로 롤백시킨다(실제로 발생).
--
--    버킷은 별도로 생성한다:
--      - 대시보드 Storage UI에서 'community-photos' (Public, 10MB,
--        image/jpeg·png·webp) 생성, 또는
--      - service_role 키로 supabase-js storage.createBucket() 호출.
--    이 앱은 이미지 업로드를 admin(service_role) 클라이언트로 하고(RLS 우회)
--    public URL로 조회하므로 storage.objects 정책은 필요 없다.


-- ----------------------------------------------------------------------------
-- 5. REALTIME — 새 글/댓글/좋아요 실시간 반영
--    이미 publication에 추가돼 있거나 권한 이슈가 있어도 마이그레이션이
--    깨지지 않도록 예외를 삼킨다(실시간은 부가 기능).
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_posts;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_comments;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE community_post_likes;
EXCEPTION WHEN others THEN NULL; END $$;

-- PostgREST 스키마 캐시 갱신 (새 테이블 즉시 인식)
NOTIFY pgrst, 'reload schema';
