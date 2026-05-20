-- ============================================================================
-- 반띵 — Storage 버킷 및 정책
-- Version: 1.0.0
-- ============================================================================

-- ============================================================================
-- 1. BUCKETS
-- ============================================================================

-- 1.1 party-photos — 모집글 사진 (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'party-photos',
    'party-photos',
    true,                                          -- public read (썸네일 URL 직접 노출)
    5242880,                                       -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 1.2 receipts — 영수증 (private, party 멤버만)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'receipts',
    'receipts',
    false,                                         -- private (signed URL로 접근)
    10485760,                                      -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 1.3 profile-images — 프로필 사진 (Phase 2, public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'profile-images',
    'profile-images',
    true,
    2097152,                                       -- 2MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 2. STORAGE POLICIES
-- ============================================================================
-- 경로 규약:
--   party-photos:    {party_id}/{filename}
--   receipts:        {party_id}/{filename}
--   profile-images:  {user_id}/{filename}
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 party-photos
-- ----------------------------------------------------------------------------
CREATE POLICY "party_photos_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'party-photos');

-- 호스트만 업로드 (경로 첫 폴더 = party_id, 호스트여야 함)
CREATE POLICY "party_photos_host_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'party-photos'
        AND is_party_host((storage.foldername(name))[1]::uuid)
    );

CREATE POLICY "party_photos_host_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'party-photos'
        AND is_party_host((storage.foldername(name))[1]::uuid)
    );


-- ----------------------------------------------------------------------------
-- 2.2 receipts (private)
-- ----------------------------------------------------------------------------
-- party 멤버만 SELECT (signed URL 발급 단계에서 검증)
CREATE POLICY "receipts_member_select"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'receipts'
        AND is_party_member((storage.foldername(name))[1]::uuid)
    );

CREATE POLICY "receipts_member_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'receipts'
        AND is_party_member((storage.foldername(name))[1]::uuid)
    );


-- ----------------------------------------------------------------------------
-- 2.3 profile-images
-- ----------------------------------------------------------------------------
CREATE POLICY "profile_images_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'profile-images');

CREATE POLICY "profile_images_own_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'profile-images'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "profile_images_own_update"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'profile-images'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "profile_images_own_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'profile-images'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );
