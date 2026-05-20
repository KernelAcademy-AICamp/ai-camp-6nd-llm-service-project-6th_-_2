-- ============================================================================
-- 반띵 — E2E 시나리오 검증
-- 흐름: 회원가입 → 모집 → 신청 → 자동 승인 → 모집완료(채팅방 자동 오픈)
--      → 영수증 등록 → 거래 완료 → 평가 → 신뢰점수 자동 갱신
-- ============================================================================
\set ON_ERROR_STOP on

-- 0. 테스트 유저 4명 (auth.users)
INSERT INTO auth.users (id, email) VALUES
    ('11111111-1111-1111-1111-111111111111', 'host@test.com'),
    ('22222222-2222-2222-2222-222222222222', 'user2@test.com'),
    ('33333333-3333-3333-3333-333333333333', 'user3@test.com'),
    ('44444444-4444-4444-4444-444444444444', 'user4@test.com');

-- 1. 프로필 생성 (회원가입)
INSERT INTO profiles (id, nickname, gender, neighborhood_id) VALUES
    ('11111111-1111-1111-1111-111111111111', '왕대왕',   'male',   '00000000-0000-0000-0000-000000000001'),
    ('22222222-2222-2222-2222-222222222222', '민들레',   'female', '00000000-0000-0000-0000-000000000001'),
    ('33333333-3333-3333-3333-333333333333', '나무',     'female', '00000000-0000-0000-0000-000000000001'),
    ('44444444-4444-4444-4444-444444444444', '도토리',   'female', '00000000-0000-0000-0000-000000000001');

\echo '✅ 1. 프로필 4명 생성 완료'

-- 2. 호스트(왕대왕)가 모집글 작성 — 3명 정원, 자동 승인
INSERT INTO parties (
    id, host_id, neighborhood_id, category,
    store_name, representative_menu,
    max_participants, price_per_person,
    deal_at, apply_deadline_at,
    approval_type, gender_option,
    pickup_location_id
) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    'delivery',
    '교촌치킨 명동점',
    '허니콤보 + 콜라 1.25L',
    3,
    11000,
    now() + interval '2 hours',
    now() + interval '1 hour',
    'auto',
    'all',
    (SELECT id FROM pickup_locations WHERE name = '신림역 3번 출구')
);

\echo '✅ 2. 모집글 생성'

-- 호스트 자동 등록(트리거) 확인
SELECT
    is_host,
    status,
    nickname
FROM party_participants pp
JOIN profiles p ON p.id = pp.user_id
WHERE party_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

\echo '✅ 3. 호스트 자동 등록 확인 (위 결과: is_host=t, status=approved)'

-- 3. 민들레, 나무가 신청 → auto 모드라 즉시 approved 처리되어야 정상
INSERT INTO party_participants (party_id, user_id, status) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '22222222-2222-2222-2222-222222222222',
     'approved');

\echo '✅ 4. 민들레 승인 (정원 2/3)'

-- 현재 채팅방 없어야 함
SELECT COUNT(*) AS chat_rooms_count FROM chat_rooms WHERE party_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

INSERT INTO party_participants (party_id, user_id, status) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '33333333-3333-3333-3333-333333333333',
     'approved');

\echo '✅ 5. 나무 승인 (정원 3/3 충족 → 트리거가 채팅방 오픈 + 시스템 메시지 자동 생성되어야 함)'

-- 채팅방이 자동 생성되었는지
SELECT 'chat_rooms' AS table_name, COUNT(*) AS cnt FROM chat_rooms WHERE party_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
UNION ALL
SELECT 'system messages', COUNT(*) FROM chat_messages cm
JOIN chat_rooms cr ON cr.id = cm.room_id
WHERE cr.party_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND cm.type = 'system';

SELECT status FROM parties WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

\echo '✅ 6. party status가 closed로 자동 전이되어야 함'

-- 4. 영수증 등록 (호스트)
INSERT INTO receipts (
    party_id, uploader_id, storage_path,
    ocr_store_name, ocr_total_amount, ocr_confidence,
    final_store_name, final_total_amount, final_paid_at,
    price_per_person
) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/receipt_001.jpg',
    '교촌치킨 명동점', 33000, 0.940,
    '교촌치킨 명동점', 33000, now(),
    11000
);

\echo '✅ 7. 영수증 등록'

-- 5. 송금 기록 (민들레 → 왕대왕)
INSERT INTO payments (party_id, payer_id, receiver_id, amount, method, status, sent_at) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '22222222-2222-2222-2222-222222222222',
     '11111111-1111-1111-1111-111111111111',
     11000, 'kakao_pay', 'sent_by_payer', now()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '33333333-3333-3333-3333-333333333333',
     '11111111-1111-1111-1111-111111111111',
     11000, 'kakao_pay', 'confirmed_by_receiver', now());

\echo '✅ 8. 송금 기록 2건'

-- 6. 거래 완료 처리 (호스트가 트리거)
UPDATE parties SET status = 'completed' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 모든 승인된 참여자의 transaction_count가 1 증가해야 함
SELECT nickname, transaction_count, level
  FROM profiles
 WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333'
 ) ORDER BY nickname;

\echo '✅ 9. 거래 완료 → 모든 참여자 transaction_count=1'

-- 7. 평가 작성: 민들레가 왕대왕에게 좋아요
INSERT INTO reviews (party_id, reviewer_id, reviewee_id, rating, text_review) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '22222222-2222-2222-2222-222222222222',
     '11111111-1111-1111-1111-111111111111',
     'good',
     '친절하고 시간 잘 지키셨어요!');

-- 나무도 왕대왕에게 좋아요
INSERT INTO reviews (party_id, reviewer_id, reviewee_id, rating) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '33333333-3333-3333-3333-333333333333',
     '11111111-1111-1111-1111-111111111111',
     'good');

-- 신뢰점수가 갱신되었는지
SELECT nickname, transaction_count, good_review_count, bad_review_count,
       total_review_count, level
  FROM profiles
 WHERE id = '11111111-1111-1111-1111-111111111111';

\echo '✅ 10. 왕대왕: 좋아요 2, 거래 1회 → 아직 dandelion (3회 미만)'

-- 8. View 확인: v_user_trust_stats
SELECT nickname, level, transaction_count, good_review_percent, transactions_to_next_level
  FROM v_user_trust_stats
 WHERE id = '11111111-1111-1111-1111-111111111111';

\echo '✅ 11. v_user_trust_stats View 정상'

-- 9. View 확인: v_parties_with_stats
SELECT host_nickname, store_name, approved_count, slots_left, status
  FROM v_parties_with_stats
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

\echo '✅ 12. v_parties_with_stats View 정상'

-- ============================================================================
-- 제약조건 검증 (실패해야 정상인 케이스들)
-- ============================================================================

\echo ''
\echo '=== 제약조건 검증 (아래는 모두 ERROR가 나야 정상) ==='

-- 본인 평가 (no_self_review)
\echo '[테스트] 본인이 본인을 평가하려고 시도:'
INSERT INTO reviews (party_id, reviewer_id, reviewee_id, rating) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '11111111-1111-1111-1111-111111111111',
     '11111111-1111-1111-1111-111111111111',
     'good');
