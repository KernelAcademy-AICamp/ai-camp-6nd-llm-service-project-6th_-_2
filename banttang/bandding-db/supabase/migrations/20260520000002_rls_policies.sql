-- ============================================================================
-- 반띵 — Row Level Security 정책
-- Version: 1.0.0
-- ============================================================================
--
-- 보안 원칙
-- ---------
-- 1. Lazy Auth: parties/profiles/neighborhoods/pickup_locations SELECT는 anon 허용
--    → 회원가입 없이 둘러보기 가능
-- 2. 작성/수정/참여는 authenticated만
-- 3. 채팅/영수증/결제는 해당 party 멤버만
-- 4. 평가는 같은 party의 다른 멤버에게만, 한 번씩
-- ============================================================================

-- ============================================================================
-- 1. RLS 활성화
-- ============================================================================
ALTER TABLE neighborhoods         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_locations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms_agreements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties               ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_photos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_participants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase2_alerts         ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 2. HELPER FUNCTIONS (RLS에서 재사용)
-- ============================================================================

-- 사용자가 해당 party의 승인된 멤버인지
CREATE OR REPLACE FUNCTION is_party_member(_party_id uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM party_participants
         WHERE party_id = _party_id
           AND user_id  = auth.uid()
           AND status   = 'approved'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 사용자가 해당 party의 호스트인지
CREATE OR REPLACE FUNCTION is_party_host(_party_id uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM parties
         WHERE id      = _party_id
           AND host_id = auth.uid()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 사용자가 해당 채팅방 참여자인지
CREATE OR REPLACE FUNCTION is_room_member(_room_id uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1
          FROM chat_rooms r
          JOIN party_participants pp ON pp.party_id = r.party_id
         WHERE r.id      = _room_id
           AND pp.user_id = auth.uid()
           AND pp.status  = 'approved'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================================
-- 3. neighborhoods — 누구나 SELECT (anon 포함)
-- ============================================================================
CREATE POLICY "neighborhoods_select_all"
    ON neighborhoods FOR SELECT
    USING (true);


-- ============================================================================
-- 4. pickup_locations — 누구나 SELECT
-- ============================================================================
CREATE POLICY "pickup_locations_select_all"
    ON pickup_locations FOR SELECT
    USING (is_active = true);


-- ============================================================================
-- 5. profiles
-- ============================================================================
-- 누구나 다른 사람 프로필 조회 가능 (닉네임/등급/거래수 등 공개 정보)
CREATE POLICY "profiles_select_all"
    ON profiles FOR SELECT
    USING (true);

-- 본인만 INSERT (회원가입 시)
CREATE POLICY "profiles_insert_own"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- 본인만 UPDATE (단, 신뢰점수 컬럼은 trigger로만 변경되어야 함 → 앱에서 안 보냄)
CREATE POLICY "profiles_update_own"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);


-- ============================================================================
-- 6. terms_agreements — 본인만
-- ============================================================================
CREATE POLICY "terms_select_own"
    ON terms_agreements FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "terms_insert_own"
    ON terms_agreements FOR INSERT
    WITH CHECK (auth.uid() = user_id);


-- ============================================================================
-- 7. parties
-- ============================================================================
-- 누구나 모집중/완료된 글 조회 가능 (Lazy Auth — 둘러보기)
CREATE POLICY "parties_select_public"
    ON parties FOR SELECT
    USING (
        status IN ('recruiting', 'closed', 'in_progress', 'completed')
        OR host_id = auth.uid()
    );

-- 본인이 host로 작성
CREATE POLICY "parties_insert_own"
    ON parties FOR INSERT
    WITH CHECK (auth.uid() = host_id);

-- 호스트만 수정 (status는 trigger로 관리)
CREATE POLICY "parties_update_host"
    ON parties FOR UPDATE
    USING (auth.uid() = host_id)
    WITH CHECK (auth.uid() = host_id);


-- ============================================================================
-- 8. party_photos
-- ============================================================================
-- party 조회 가능하면 사진도 조회 가능
CREATE POLICY "party_photos_select_all"
    ON party_photos FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM parties p
            WHERE p.id = party_photos.party_id
              AND p.status IN ('recruiting', 'closed', 'in_progress', 'completed')
        )
    );

-- 호스트만 사진 추가/삭제
CREATE POLICY "party_photos_insert_host"
    ON party_photos FOR INSERT
    WITH CHECK (is_party_host(party_id));

CREATE POLICY "party_photos_delete_host"
    ON party_photos FOR DELETE
    USING (is_party_host(party_id));


-- ============================================================================
-- 9. party_participants
-- ============================================================================
-- 누구나 SELECT (참여 현황은 공개 정보)
CREATE POLICY "participants_select_all"
    ON party_participants FOR SELECT
    USING (true);

-- 본인만 신청 (INSERT)
CREATE POLICY "participants_insert_self"
    ON party_participants FOR INSERT
    WITH CHECK (auth.uid() = user_id AND is_host = false);

-- 본인 또는 호스트만 UPDATE
--   - 본인: 신청 취소 (status = 'cancelled')
--   - 호스트: 승인/거절 (status = 'approved' / 'rejected')
CREATE POLICY "participants_update_self_or_host"
    ON party_participants FOR UPDATE
    USING (
        auth.uid() = user_id OR is_party_host(party_id)
    )
    WITH CHECK (
        auth.uid() = user_id OR is_party_host(party_id)
    );


-- ============================================================================
-- 10. chat_rooms — 멤버만
-- ============================================================================
CREATE POLICY "chat_rooms_select_member"
    ON chat_rooms FOR SELECT
    USING (is_party_member(party_id));


-- ============================================================================
-- 11. chat_messages
-- ============================================================================
CREATE POLICY "messages_select_member"
    ON chat_messages FOR SELECT
    USING (is_room_member(room_id));

CREATE POLICY "messages_insert_member"
    ON chat_messages FOR INSERT
    WITH CHECK (
        is_room_member(room_id)
        AND auth.uid() = sender_id
        AND type <> 'system'  -- 시스템 메시지는 SECURITY DEFINER 함수로만
    );


-- ============================================================================
-- 12. receipts — party 멤버만
-- ============================================================================
CREATE POLICY "receipts_select_member"
    ON receipts FOR SELECT
    USING (is_party_member(party_id));

CREATE POLICY "receipts_insert_member"
    ON receipts FOR INSERT
    WITH CHECK (
        is_party_member(party_id)
        AND auth.uid() = uploader_id
    );

-- 업로더 본인만 수정 (OCR 결과 보정)
CREATE POLICY "receipts_update_uploader"
    ON receipts FOR UPDATE
    USING (auth.uid() = uploader_id)
    WITH CHECK (auth.uid() = uploader_id);


-- ============================================================================
-- 13. payments
-- ============================================================================
-- 송금자/수신자 본인만 조회
CREATE POLICY "payments_select_involved"
    ON payments FOR SELECT
    USING (auth.uid() IN (payer_id, receiver_id));

-- 송금자가 INSERT
CREATE POLICY "payments_insert_payer"
    ON payments FOR INSERT
    WITH CHECK (
        auth.uid() = payer_id
        AND is_party_member(party_id)
    );

-- 송금자(status: sent_by_payer로) / 수신자(status: confirmed_by_receiver로) 변경
CREATE POLICY "payments_update_involved"
    ON payments FOR UPDATE
    USING (auth.uid() IN (payer_id, receiver_id))
    WITH CHECK (auth.uid() IN (payer_id, receiver_id));


-- ============================================================================
-- 14. reviews
-- ============================================================================
-- 같은 party 멤버끼리만 SELECT (익명이지만 내부 공개)
CREATE POLICY "reviews_select_member"
    ON reviews FOR SELECT
    USING (
        is_party_member(party_id)
        OR auth.uid() = reviewee_id  -- 평가받은 본인은 항상 조회 가능
    );

-- 본인이 같은 party의 다른 멤버에게만 작성
CREATE POLICY "reviews_insert_member"
    ON reviews FOR INSERT
    WITH CHECK (
        auth.uid() = reviewer_id
        AND is_party_member(party_id)
        AND EXISTS (
            SELECT 1 FROM party_participants
            WHERE party_id = reviews.party_id
              AND user_id  = reviews.reviewee_id
              AND status   = 'approved'
        )
    );


-- ============================================================================
-- 15. reports — 본인이 신고한 것만 조회
-- ============================================================================
CREATE POLICY "reports_select_own"
    ON reports FOR SELECT
    USING (auth.uid() = reporter_id);

CREATE POLICY "reports_insert_own"
    ON reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);


-- ============================================================================
-- 16. notifications — 본인만
-- ============================================================================
CREATE POLICY "notifications_select_own"
    ON notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
    ON notifications FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ============================================================================
-- 17. phase2_alerts — 본인만
-- ============================================================================
CREATE POLICY "phase2_select_own"
    ON phase2_alerts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "phase2_insert_own"
    ON phase2_alerts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "phase2_update_own"
    ON phase2_alerts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "phase2_delete_own"
    ON phase2_alerts FOR DELETE
    USING (auth.uid() = user_id);


-- ============================================================================
-- 18. REALTIME PUBLICATION
-- ============================================================================
-- Supabase Realtime 구독 대상 테이블 등록
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE party_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE parties;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE receipts;
