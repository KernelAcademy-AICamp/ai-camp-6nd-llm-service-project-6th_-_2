-- pick_waitlist — 큐레이션 추천 상품에 대해 "파티장이 등록되면 알려달라"고 신청한 대기열.
-- /picks/[id]에서 파티원으로 참여하기 → 동일 store_name의 모집중 파티가 없을 때 "파티장 기다리기"로 INSERT.
-- 누군가가 같은 store_name으로 비-AI 파티를 만들면 notify 함수가 대기자들에게 알림 INSERT.

-- 1) 알림 enum에 새 타입 추가 (DB enum은 ALTER TYPE으로만 확장 가능)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pick_host_registered';

-- 2) 대기열 테이블
CREATE TABLE IF NOT EXISTS pick_waitlist (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    -- 매칭 키 — 큐레이션 카드의 store_name과 동일 문자열로 저장.
    -- 별도 product 테이블이 없어서 문자열 매칭으로 시작. 추후 normalize 필요시 product_id로 마이그.
    product_key text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    notified_at timestamptz,
    UNIQUE (user_id, product_key)
);

CREATE INDEX IF NOT EXISTS idx_pick_waitlist_pending
    ON pick_waitlist (product_key)
    WHERE notified_at IS NULL;

-- 3) RLS — 본인 행만 SELECT/INSERT/DELETE
ALTER TABLE pick_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pick_waitlist_select_own ON pick_waitlist;
CREATE POLICY pick_waitlist_select_own ON pick_waitlist
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pick_waitlist_insert_own ON pick_waitlist;
CREATE POLICY pick_waitlist_insert_own ON pick_waitlist
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS pick_waitlist_delete_own ON pick_waitlist;
CREATE POLICY pick_waitlist_delete_own ON pick_waitlist
    FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE pick_waitlist IS '큐레이션 추천 상품에 대해 파티장 등록 알림 대기 신청한 사용자 목록';

-- 4) trigger 함수 — 새 파티가 만들어지면(비-AI) 같은 store_name 대기자에게 알림 INSERT.
--    SECURITY DEFINER 로 RLS 우회 (notifications INSERT는 본인 외 INSERT 불가하므로).
CREATE OR REPLACE FUNCTION notify_pick_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    waiter record;
BEGIN
    -- AI 시드 방은 매칭 대상이 아님
    IF NEW.is_ai_pick = true THEN
        RETURN NEW;
    END IF;
    -- 모집중 상태로 들어온 것만 fan-out
    IF NEW.status <> 'recruiting' THEN
        RETURN NEW;
    END IF;

    FOR waiter IN
        SELECT id, user_id
        FROM pick_waitlist
        WHERE product_key = NEW.store_name
          AND notified_at IS NULL
          -- 본인이 만든 파티에 본인이 알림받지 않게 제외
          AND user_id <> NEW.host_id
    LOOP
        INSERT INTO notifications (user_id, type, title, body, link_path, related_party_id)
        VALUES (
            waiter.user_id,
            'pick_host_registered',
            '파티장이 등록됐어요!',
            NEW.store_name || ' 파티장이 방금 모집을 시작했어요. 매칭받기를 눌러주세요.',
            '/feed/' || NEW.id::text,
            NEW.id
        );

        UPDATE pick_waitlist
        SET notified_at = now()
        WHERE id = waiter.id;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_pick_waitlist ON parties;
CREATE TRIGGER trg_notify_pick_waitlist
    AFTER INSERT ON parties
    FOR EACH ROW
    EXECUTE FUNCTION notify_pick_waitlist();
