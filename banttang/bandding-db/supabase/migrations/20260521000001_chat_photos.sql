-- ============================================================================
-- 반띵 — chat-photos 버킷 (채팅방 내 이미지 메시지)
-- Version: 1.0.0
-- ----------------------------------------------------------------------------
-- 명세서 F302 / A206 / E803 기준:
--   - JPG/PNG/WEBP (HEIC은 모바일 카메라 원본 대비 변환 필요 — 별도 핸들링)
--   - 단일 파일 최대 10MB
--   - 메시지 1건당 최대 5장 (클라이언트 검증)
--
-- chat_messages.metadata 활용 패턴:
--   { kind: "image", storage_path: "{party_id}/...jpg", width?, height? }
--
-- 경로 규약: chat-photos/{party_id}/{filename}
--   → storage.foldername(name)[1] == party_id
--   → is_party_member()로 멤버 검증
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'chat-photos',
    'chat-photos',
    true,                                          -- public read (URL 직접 노출)
    10485760,                                      -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 정책
-- ----------------------------------------------------------------------------
-- 누구나 read OK (public 버킷)
DROP POLICY IF EXISTS "chat_photos_public_read" ON storage.objects;
CREATE POLICY "chat_photos_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'chat-photos');

-- 파티 approved 멤버만 업로드 (party_id가 경로 첫 폴더)
DROP POLICY IF EXISTS "chat_photos_member_insert" ON storage.objects;
CREATE POLICY "chat_photos_member_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'chat-photos'
        AND is_party_member((storage.foldername(name))[1]::uuid)
    );

-- 본인이 올린 파일만 삭제(메시지 삭제 기능 대비, 현재 UI에는 미노출)
DROP POLICY IF EXISTS "chat_photos_owner_delete" ON storage.objects;
CREATE POLICY "chat_photos_owner_delete"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'chat-photos'
        AND auth.uid() = owner
    );
