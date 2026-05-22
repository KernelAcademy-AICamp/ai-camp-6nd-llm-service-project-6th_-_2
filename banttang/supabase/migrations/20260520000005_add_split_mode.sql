-- ============================================================================
-- 반띵 — parties.split_mode 추가
-- Version: 1.1.0
-- Description: 호스트 주문 생성 시 ‘1주문 나누기 / 각자 항목 결정하기’ 분기.
--              DB에는 보관하되, 호스트·파티원 화면에는 직접 노출하지 않는다.
--              표시 단계에서는 each-pay 케이스의 가격 줄을 숨기는 신호로 사용.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE split_mode AS ENUM (
        'single_order',       -- 1주문 나누기 (한 번 주문해서 N등분, 예상 1인 금액 입력)
        'individual_items'    -- 각자 항목 결정 (각자 결제, 예상 금액 입력 없음)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE parties
    ADD COLUMN IF NOT EXISTS split_mode split_mode NOT NULL DEFAULT 'single_order';

COMMENT ON COLUMN parties.split_mode IS
'주문 생성 분기. single_order=한 번 사서 나눔(가격 노출), individual_items=각자 구매(가격 미노출)';

-- 홈 피드 뷰도 동일하게 split_mode 노출 (p.* 이므로 자동 포함되지만 명시적으로 재생성)
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
