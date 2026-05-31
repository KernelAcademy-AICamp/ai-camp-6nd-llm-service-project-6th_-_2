-- 모집글 사진 한도 3 → 10으로 확장.
-- party_photos.order_index의 CHECK 제약을 0~2 에서 0~9 로 완화.
--
-- 기존 인덱스/유니크 제약(party_id, order_index) 그대로 유지 — 같은 슬롯 중복 INSERT는 여전히 차단.

ALTER TABLE party_photos
    DROP CONSTRAINT IF EXISTS party_photos_order_index_check;

ALTER TABLE party_photos
    ADD CONSTRAINT party_photos_order_index_check
    CHECK (order_index BETWEEN 0 AND 9);
