-- ============================================================================
-- 반띵 (Bandding) — 초기 스키마
-- Version: 1.0.0
-- Description: 동네 1인가구 공동구매 서비스 MVP 스키마
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";       -- 위치 기반 동네/픽업
CREATE EXTENSION IF NOT EXISTS "pg_cron";       -- 마감/상태 전이 자동화
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- 가게명 검색


-- ============================================================================
-- 2. ENUM TYPES
-- ============================================================================
CREATE TYPE gender_type AS ENUM ('female', 'male', 'prefer_not_to_say');

CREATE TYPE user_level AS ENUM ('dandelion', 'tree', 'king');
-- dandelion(민들레, 가입 직후) → tree(나무) → king(왕대왕)

CREATE TYPE party_category AS ENUM (
    'delivery',           -- Phase 1: 배달
    'offline_shopping',   -- Phase 2: 오프라인 장보기
    'online_shopping'     -- Phase 2: 온라인 장보기
);

CREATE TYPE party_status AS ENUM (
    'recruiting',    -- 모집중
    'closed',        -- 모집완료 (정원 충족 → 채팅방 오픈)
    'in_progress',   -- 거래중 (거래 시각 이후)
    'completed',     -- 거래완료 (영수증 인증 + 평가 완료)
    'cancelled'      -- 취소 (호스트 취소 / 인원 미달 마감)
);

CREATE TYPE approval_type AS ENUM ('auto', 'manual');

CREATE TYPE gender_option AS ENUM ('all', 'same_gender');

CREATE TYPE participant_status AS ENUM (
    'pending',     -- 신청 대기
    'approved',    -- 승인됨
    'rejected',    -- 거절됨
    'cancelled',   -- 본인 취소
    'no_show'      -- 노쇼 (거래 후 표시)
);

CREATE TYPE message_type AS ENUM (
    'text',           -- 일반 텍스트
    'system',         -- 시스템 메시지 (모집완료, 거래30분전 등)
    'receipt_card',   -- 영수증 카드
    'payment_card'    -- 송금 카드
);

CREATE TYPE system_event_type AS ENUM (
    'party_closed',         -- 모집 완료! 거래방 오픈
    'pickup_location_set',  -- 픽업 장소: ~
    'receipt_uploaded',     -- 영수증 등록됨
    'before_30min',         -- 거래 30분 전입니다
    'before_10min',         -- 거래 10분 전입니다
    'party_completed'       -- 거래가 완료되었어요
);

CREATE TYPE review_rating AS ENUM ('good', 'bad');

CREATE TYPE payment_method AS ENUM (
    'kakao_pay',
    'toss',
    'bank_transfer',
    'cash',
    'other'
);

CREATE TYPE payment_status AS ENUM (
    'pending',                -- 송금 전
    'sent_by_payer',          -- 송금자가 송금 완료 표시
    'confirmed_by_receiver'   -- 호스트가 수령 확인
);

CREATE TYPE report_target_type AS ENUM ('party', 'user', 'message', 'review');

CREATE TYPE report_status AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');

CREATE TYPE notification_type AS ENUM (
    'application_received',   -- 참여 신청 받음 (호스트에게)
    'application_approved',   -- 신청 승인됨
    'application_rejected',   -- 신청 거절됨
    'party_closed',           -- 모집 완료
    'before_deal',            -- 거래 임박 알림
    'receipt_uploaded',       -- 영수증 등록됨
    'review_requested',       -- 평가 요청
    'payment_received',       -- 송금 받음
    'phase2_available'        -- 장보기 출시 알림
);

CREATE TYPE shopping_type AS ENUM ('offline', 'online');


-- ============================================================================
-- 3. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 neighborhoods — 동네 마스터
-- ----------------------------------------------------------------------------
CREATE TABLE neighborhoods (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            text NOT NULL,                    -- "신림동"
    district        text NOT NULL,                    -- "관악구"
    city            text NOT NULL,                    -- "서울특별시"
    center_point    geography(Point, 4326) NOT NULL,
    radius_meters   int  NOT NULL DEFAULT 1500,       -- 동네 반경
    is_active       boolean NOT NULL DEFAULT false,   -- 베타 동네만 true
    active_user_count int  NOT NULL DEFAULT 0,        -- "12명이 반띵 중"
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (city, district, name)
);

COMMENT ON TABLE  neighborhoods IS '베타 운영 동네 마스터';
COMMENT ON COLUMN neighborhoods.active_user_count IS '온보딩에 표시되는 "N명이 반띵 중" 값. 주기적 갱신';


-- ----------------------------------------------------------------------------
-- 3.2 pickup_locations — AI 추천 안전 장소
-- ----------------------------------------------------------------------------
CREATE TABLE pickup_locations (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    neighborhood_id     uuid NOT NULL REFERENCES neighborhoods(id) ON DELETE CASCADE,
    name                text NOT NULL,                      -- "신림역 3번 출구"
    walk_minutes        int  NOT NULL CHECK (walk_minutes BETWEEN 1 AND 60),
    features            text[] NOT NULL DEFAULT '{}',       -- ['유동인구_많음','CCTV','24시간_운영']
    point               geography(Point, 4326) NOT NULL,
    display_order       int  NOT NULL DEFAULT 0,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pickup_locations IS '동네별 AI 추천 안전 픽업 장소';


-- ----------------------------------------------------------------------------
-- 3.3 profiles — 사용자 프로필 (auth.users 확장)
-- ----------------------------------------------------------------------------
CREATE TABLE profiles (
    id                      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname                text NOT NULL UNIQUE,
    gender                  gender_type NOT NULL,
    neighborhood_id         uuid REFERENCES neighborhoods(id),

    -- 신뢰점수 관련 (trigger로 갱신)
    level                   user_level NOT NULL DEFAULT 'dandelion',
    transaction_count       int NOT NULL DEFAULT 0,    -- 완료된 거래 수 (good_review_count와 별개)
    good_review_count       int NOT NULL DEFAULT 0,    -- "좋았어요" 받은 수
    bad_review_count        int NOT NULL DEFAULT 0,    -- "별로" 받은 수
    total_review_count      int NOT NULL DEFAULT 0,    -- 받은 평가 총합
    no_show_count           int NOT NULL DEFAULT 0,

    -- 메타
    is_beta_user            boolean NOT NULL DEFAULT true,
    joined_at               timestamptz NOT NULL DEFAULT now(),
    last_active_at          timestamptz NOT NULL DEFAULT now(),

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT nickname_length CHECK (char_length(nickname) BETWEEN 2 AND 10),
    CONSTRAINT nickname_format CHECK (nickname ~ '^[가-힣a-zA-Z0-9_]+$')
);

COMMENT ON TABLE  profiles IS 'auth.users 확장. nickname 등 도메인 정보';
COMMENT ON COLUMN profiles.transaction_count IS '완료된 거래 수. compute_user_level()의 입력';


-- ----------------------------------------------------------------------------
-- 3.4 terms_agreements — 약관 동의 이력
-- ----------------------------------------------------------------------------
CREATE TABLE terms_agreements (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    terms_version   text NOT NULL,                     -- "v1.0", "v1.1"
    agreed_items    jsonb NOT NULL,                    -- {"service": true, "privacy": true, ...}
    agreed_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE terms_agreements IS '버전별 약관 동의 이력. 분쟁 시 근거';


-- ----------------------------------------------------------------------------
-- 3.5 parties — 모집글 (핵심 테이블)
-- ----------------------------------------------------------------------------
CREATE TABLE parties (
    id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_id                 uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    neighborhood_id         uuid NOT NULL REFERENCES neighborhoods(id),
    category                party_category NOT NULL,

    -- 가게/메뉴
    store_name              text NOT NULL,
    representative_menu     text,                          -- nullable: Phase 2 장보기는 없을 수 있음

    -- 인원/금액
    max_participants        int  NOT NULL CHECK (max_participants BETWEEN 2 AND 4),
    price_per_person        int  NOT NULL CHECK (price_per_person >= 0),

    -- 시간
    deal_at                 timestamptz NOT NULL,          -- 거래 예정 시각
    apply_deadline_at       timestamptz NOT NULL,          -- 신청 마감 (보통 deal_at - 1h)

    -- 정책
    approval_type           approval_type NOT NULL DEFAULT 'auto',
    gender_option           gender_option NOT NULL DEFAULT 'all',

    -- 픽업 장소 (둘 중 하나)
    pickup_location_id      uuid REFERENCES pickup_locations(id),
    custom_pickup_name      text,
    custom_pickup_point     geography(Point, 4326),

    -- 결제
    paid_by_host            boolean NOT NULL DEFAULT true, -- 호스트 선결제 여부

    -- 상태
    status                  party_status NOT NULL DEFAULT 'recruiting',
    closed_at               timestamptz,
    completed_at            timestamptz,
    cancelled_at            timestamptz,
    cancel_reason           text,

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pickup_required CHECK (
        pickup_location_id IS NOT NULL OR custom_pickup_point IS NOT NULL
    ),
    CONSTRAINT deadline_before_deal CHECK (apply_deadline_at <= deal_at),
    CONSTRAINT future_deal CHECK (deal_at > created_at)
);

COMMENT ON TABLE  parties IS '반띵 모집글. category로 배달/장보기 구분';
COMMENT ON COLUMN parties.paid_by_host IS 'true면 호스트가 선결제, 참여자는 후송금. 와이어상 기본 흐름';


-- ----------------------------------------------------------------------------
-- 3.6 party_photos — 모집글 사진 (최대 10장)
-- ----------------------------------------------------------------------------
CREATE TABLE party_photos (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id        uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    storage_path    text NOT NULL,                     -- Storage 'party-photos/{party_id}/{filename}'
    order_index     int  NOT NULL CHECK (order_index BETWEEN 0 AND 9),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (party_id, order_index)
);


-- ----------------------------------------------------------------------------
-- 3.7 party_participants — 참여자 (호스트도 포함)
-- ----------------------------------------------------------------------------
CREATE TABLE party_participants (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id        uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    status          participant_status NOT NULL DEFAULT 'pending',
    is_host         boolean NOT NULL DEFAULT false,

    applied_at      timestamptz NOT NULL DEFAULT now(),
    approved_at     timestamptz,
    cancelled_at    timestamptz,

    UNIQUE (party_id, user_id)
);

COMMENT ON COLUMN party_participants.is_host IS '호스트도 row로 둠 → 멤버 조회 단순화';


-- ----------------------------------------------------------------------------
-- 3.8 chat_rooms — 채팅방 (1 party : 1 room)
-- ----------------------------------------------------------------------------
CREATE TABLE chat_rooms (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id        uuid NOT NULL UNIQUE REFERENCES parties(id) ON DELETE CASCADE,
    opened_at       timestamptz NOT NULL DEFAULT now(),
    closed_at       timestamptz                        -- 거래 완료 + N시간 후
);


-- ----------------------------------------------------------------------------
-- 3.9 chat_messages — 채팅 메시지
-- ----------------------------------------------------------------------------
CREATE TABLE chat_messages (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id         uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
    type            message_type NOT NULL DEFAULT 'text',
    system_event    system_event_type,                 -- type='system'일 때만 사용
    content         text,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT system_or_sender CHECK (
        (type = 'system' AND sender_id IS NULL) OR
        (type <> 'system' AND sender_id IS NOT NULL)
    )
);

COMMENT ON COLUMN chat_messages.metadata IS
'카드 메시지용. receipt_card: {receipt_id, amount}, payment_card: {payment_id, amount, receiver_id}';


-- ----------------------------------------------------------------------------
-- 3.10 receipts — 영수증
-- ----------------------------------------------------------------------------
CREATE TABLE receipts (
    id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id            uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    uploader_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    storage_path        text NOT NULL,                 -- 'receipts/{party_id}/{filename}'

    -- OCR 원본 결과
    ocr_store_name      text,
    ocr_total_amount    int,
    ocr_paid_at         timestamptz,
    ocr_confidence      numeric(4,3) CHECK (ocr_confidence BETWEEN 0 AND 1),
    ocr_raw             jsonb,                         -- 원본 응답 전체

    -- 사용자 수정 후 최종값
    final_store_name    text NOT NULL,
    final_total_amount  int  NOT NULL CHECK (final_total_amount >= 0),
    final_paid_at       timestamptz NOT NULL,
    price_per_person    int  NOT NULL,                 -- 분배된 1인 금액

    shared_to_chat_at   timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 3.11 payments — 송금 기록 (외부 송금 추적)
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id        uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    payer_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    receiver_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    amount          int  NOT NULL CHECK (amount > 0),
    method          payment_method NOT NULL,
    status          payment_status NOT NULL DEFAULT 'pending',

    sent_at         timestamptz,
    confirmed_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT no_self_payment CHECK (payer_id <> receiver_id),
    UNIQUE (party_id, payer_id, receiver_id)
);

COMMENT ON TABLE payments IS
'실제 송금은 외부(카카오톡 등). 이 테이블은 기록만. status는 사용자 자가신고';


-- ----------------------------------------------------------------------------
-- 3.12 reviews — 상호 평가
-- ----------------------------------------------------------------------------
CREATE TABLE reviews (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id        uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    reviewer_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    reviewee_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    rating          review_rating NOT NULL,
    text_review     text,                              -- 익명 공개, 최대 200자
    is_no_show      boolean NOT NULL DEFAULT false,    -- 노쇼 신고 겸용

    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT no_self_review CHECK (reviewer_id <> reviewee_id),
    CONSTRAINT text_length CHECK (text_review IS NULL OR char_length(text_review) <= 200),
    UNIQUE (party_id, reviewer_id, reviewee_id)
);


-- ----------------------------------------------------------------------------
-- 3.13 reports — 신고
-- ----------------------------------------------------------------------------
CREATE TABLE reports (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
    target_type     report_target_type NOT NULL,
    target_id       uuid NOT NULL,                     -- 다형성 (party/user/message/review의 id)
    reason_code     text NOT NULL,                     -- "spam", "scam", "abusive", ...
    reason_detail   text,
    status          report_status NOT NULL DEFAULT 'pending',
    resolved_at     timestamptz,
    resolved_note   text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN reports.target_id IS '다형성 FK. 애플리케이션 레벨에서 target_type별 검증';


-- ----------------------------------------------------------------------------
-- 3.14 notifications — 인앱 알림
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type            notification_type NOT NULL,
    title           text NOT NULL,
    body            text,
    link_path       text,                              -- 앱 내 이동 경로 '/party/{id}'
    related_party_id uuid REFERENCES parties(id) ON DELETE CASCADE,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_read         boolean NOT NULL DEFAULT false,
    read_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 3.15 phase2_alerts — 장보기 출시 알림 신청
-- ----------------------------------------------------------------------------
CREATE TABLE phase2_alerts (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    neighborhood_id uuid NOT NULL REFERENCES neighborhoods(id) ON DELETE CASCADE,
    shopping_type   shopping_type NOT NULL,
    is_enabled      boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, neighborhood_id, shopping_type)
);


-- ============================================================================
-- 4. INDEXES (조회 패턴 기반)
-- ============================================================================

-- profiles
CREATE INDEX idx_profiles_neighborhood    ON profiles(neighborhood_id);
CREATE INDEX idx_profiles_nickname_trgm   ON profiles USING gin (nickname gin_trgm_ops);

-- parties: 홈 탐색 (동네 + 상태 + 마감순)
CREATE INDEX idx_parties_home_feed
    ON parties(neighborhood_id, status, apply_deadline_at)
    WHERE status IN ('recruiting', 'closed');

CREATE INDEX idx_parties_host             ON parties(host_id, status);
CREATE INDEX idx_parties_category         ON parties(category, neighborhood_id);
CREATE INDEX idx_parties_store_trgm       ON parties USING gin (store_name gin_trgm_ops);
CREATE INDEX idx_parties_deal_at          ON parties(deal_at) WHERE status NOT IN ('completed', 'cancelled');

-- pickup_locations: 위치 기반 (PostGIS)
CREATE INDEX idx_pickup_locations_point   ON pickup_locations USING gist (point);
CREATE INDEX idx_pickup_locations_neighborhood ON pickup_locations(neighborhood_id) WHERE is_active = true;

-- neighborhoods: 위치 기반
CREATE INDEX idx_neighborhoods_center     ON neighborhoods USING gist (center_point);

-- party_participants: 마이페이지 진행중 거래
CREATE INDEX idx_participants_user_status ON party_participants(user_id, status);
CREATE INDEX idx_participants_party       ON party_participants(party_id);

-- chat_messages: 채팅방 페이지네이션
CREATE INDEX idx_messages_room_created    ON chat_messages(room_id, created_at DESC);

-- receipts
CREATE INDEX idx_receipts_party           ON receipts(party_id);

-- payments
CREATE INDEX idx_payments_party           ON payments(party_id);
CREATE INDEX idx_payments_payer           ON payments(payer_id, status);
CREATE INDEX idx_payments_receiver        ON payments(receiver_id, status);

-- reviews
CREATE INDEX idx_reviews_reviewee         ON reviews(reviewee_id);
CREATE INDEX idx_reviews_party            ON reviews(party_id);

-- notifications: 미읽음 우선
CREATE INDEX idx_notifications_user_unread
    ON notifications(user_id, created_at DESC)
    WHERE is_read = false;

-- reports
CREATE INDEX idx_reports_status           ON reports(status, created_at DESC);
CREATE INDEX idx_reports_target           ON reports(target_type, target_id);


-- ============================================================================
-- 5. FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 5.1 updated_at 자동 갱신
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 5.2 신뢰점수/등급 계산
--     기준: dandelion(0~2회) → tree(3~9회 & 좋아요 80%↑) → king(10회↑ & 좋아요 90%↑)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_user_level(
    tx_count int,
    good_count int,
    total_count int
) RETURNS user_level AS $$
DECLARE
    good_ratio numeric;
BEGIN
    good_ratio := CASE WHEN total_count = 0 THEN 0
                       ELSE good_count::numeric / total_count END;

    IF tx_count >= 10 AND good_ratio >= 0.90 THEN
        RETURN 'king';
    ELSIF tx_count >= 3 AND good_ratio >= 0.80 THEN
        RETURN 'tree';
    ELSE
        RETURN 'dandelion';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ----------------------------------------------------------------------------
-- 5.3 평가 작성 시 reviewee의 신뢰점수 갱신
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION on_review_inserted()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE profiles
    SET good_review_count  = good_review_count  + CASE WHEN NEW.rating = 'good' THEN 1 ELSE 0 END,
        bad_review_count   = bad_review_count   + CASE WHEN NEW.rating = 'bad'  THEN 1 ELSE 0 END,
        total_review_count = total_review_count + 1,
        no_show_count      = no_show_count      + CASE WHEN NEW.is_no_show THEN 1 ELSE 0 END,
        level              = compute_user_level(
                                transaction_count,
                                good_review_count + CASE WHEN NEW.rating = 'good' THEN 1 ELSE 0 END,
                                total_review_count + 1
                             ),
        updated_at         = now()
    WHERE id = NEW.reviewee_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 5.4 party 완료 시 모든 참여자의 transaction_count 증가
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION on_party_completed()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
        UPDATE profiles
        SET transaction_count = transaction_count + 1,
            level             = compute_user_level(
                                    transaction_count + 1,
                                    good_review_count,
                                    total_review_count
                                ),
            updated_at        = now()
        WHERE id IN (
            SELECT user_id FROM party_participants
            WHERE party_id = NEW.id AND status = 'approved'
        );

        NEW.completed_at = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 5.5 party 모집 마감 처리: 정원 충족 시 status='closed' + 채팅방 자동 생성
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION on_participant_approved()
RETURNS TRIGGER AS $$
DECLARE
    approved_count int;
    party_max int;
    party_status_now party_status;
    was_approved boolean;
BEGIN
    -- INSERT인 경우 OLD가 NULL이므로 was_approved=false로 처리
    was_approved := (TG_OP = 'UPDATE' AND OLD.status = 'approved');

    IF NEW.status = 'approved' AND NOT was_approved THEN
        SELECT max_participants, status
          INTO party_max, party_status_now
          FROM parties
         WHERE id = NEW.party_id
         FOR UPDATE;

        SELECT count(*) INTO approved_count
          FROM party_participants
         WHERE party_id = NEW.party_id AND status = 'approved';

        -- 정원 충족 → 모집 종료 + 채팅방 오픈
        IF approved_count >= party_max AND party_status_now = 'recruiting' THEN
            UPDATE parties
               SET status    = 'closed',
                   closed_at = now()
             WHERE id = NEW.party_id;

            INSERT INTO chat_rooms (party_id) VALUES (NEW.party_id)
            ON CONFLICT (party_id) DO NOTHING;

            INSERT INTO chat_messages (room_id, type, system_event, content)
            SELECT id, 'system', 'party_closed', '모집 완료! 거래방이 열렸어요'
              FROM chat_rooms WHERE party_id = NEW.party_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 5.6 host 자동 등록: party 생성 시 host를 party_participants에 자동 INSERT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION on_party_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO party_participants (party_id, user_id, status, is_host, approved_at)
    VALUES (NEW.id, NEW.host_id, 'approved', true, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 5.7 신청 마감 자동 처리 (cron으로 호출)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION transition_expired_parties()
RETURNS void AS $$
BEGIN
    -- 마감 시간 지났는데 인원 미달 → cancelled
    UPDATE parties
       SET status        = 'cancelled',
           cancelled_at  = now(),
           cancel_reason = 'apply_deadline_passed_understaffed'
     WHERE status = 'recruiting'
       AND apply_deadline_at < now();

    -- 거래 시각 도달 → in_progress
    UPDATE parties
       SET status = 'in_progress'
     WHERE status = 'closed'
       AND deal_at <= now();
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- updated_at 자동 갱신
CREATE TRIGGER trg_neighborhoods_updated   BEFORE UPDATE ON neighborhoods    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated        BEFORE UPDATE ON profiles         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_parties_updated         BEFORE UPDATE ON parties          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_receipts_updated        BEFORE UPDATE ON receipts         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated        BEFORE UPDATE ON payments         FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 도메인 트리거
CREATE TRIGGER trg_party_created           AFTER INSERT  ON parties          FOR EACH ROW EXECUTE FUNCTION on_party_created();
CREATE TRIGGER trg_party_completed         BEFORE UPDATE ON parties          FOR EACH ROW EXECUTE FUNCTION on_party_completed();
CREATE TRIGGER trg_review_inserted         AFTER INSERT  ON reviews          FOR EACH ROW EXECUTE FUNCTION on_review_inserted();
CREATE TRIGGER trg_participant_approved    AFTER INSERT OR UPDATE  ON party_participants FOR EACH ROW EXECUTE FUNCTION on_participant_approved();


-- ============================================================================
-- 7. CRON JOBS
-- ============================================================================
-- 매 분마다 만료된 party 상태 전이
SELECT cron.schedule(
    'transition-expired-parties',
    '* * * * *',
    $$SELECT transition_expired_parties()$$
);


-- ============================================================================
-- 8. VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 8.1 v_parties_with_stats — 홈 피드용 (남은 자리, 호스트 정보 포함)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_parties_with_stats AS
SELECT
    p.*,
    h.nickname              AS host_nickname,
    h.level                 AS host_level,
    h.transaction_count     AS host_transaction_count,
    (SELECT count(*) FROM party_participants pp
        WHERE pp.party_id = p.id AND pp.status = 'approved') AS approved_count,
    (p.max_participants -
        (SELECT count(*) FROM party_participants pp
            WHERE pp.party_id = p.id AND pp.status = 'approved')) AS slots_left,
    (SELECT array_agg(storage_path ORDER BY order_index)
        FROM party_photos WHERE party_id = p.id) AS photo_paths
FROM parties p
JOIN profiles h ON h.id = p.host_id;

COMMENT ON VIEW v_parties_with_stats IS '홈 피드/상세 페이지용 비정규화 뷰';

-- ----------------------------------------------------------------------------
-- 8.2 v_user_trust_stats — 마이/프로필용 신뢰점수 요약
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_trust_stats AS
SELECT
    p.id,
    p.nickname,
    p.level,
    p.transaction_count,
    p.good_review_count,
    p.bad_review_count,
    p.total_review_count,
    p.no_show_count,
    CASE WHEN p.total_review_count = 0 THEN NULL
         ELSE ROUND(p.good_review_count::numeric * 100 / p.total_review_count, 0)
    END AS good_review_percent,
    -- 다음 등급까지 남은 거래 수
    CASE
        WHEN p.level = 'king' THEN 0
        WHEN p.level = 'tree' THEN GREATEST(0, 10 - p.transaction_count)
        ELSE GREATEST(0, 3 - p.transaction_count)
    END AS transactions_to_next_level
FROM profiles p;
