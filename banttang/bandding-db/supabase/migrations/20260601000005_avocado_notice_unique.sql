-- 방장봇 아보카도 시스템 메시지 중복 방지.
-- (room_id, version)당 1건만 허용. race condition으로 SELECT-then-INSERT가
-- 동시에 일어나도 DB가 거부.

-- 1) 기존 중복 정리 — 같은 (room_id, version)에서 가장 먼저 생긴 row만 남기고 삭제.
DELETE FROM chat_messages a
USING chat_messages b
WHERE a.id > b.id
  AND a.room_id = b.room_id
  AND a.type = 'system'
  AND b.type = 'system'
  AND a.metadata->>'kind' = 'avocado_notice'
  AND b.metadata->>'kind' = 'avocado_notice'
  AND a.metadata->>'version' = b.metadata->>'version';

-- 2) 부분 unique index — kind='avocado_notice'인 시스템 메시지만 대상.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_avocado_notice
    ON chat_messages (room_id, ((metadata->>'version')))
    WHERE type = 'system' AND metadata->>'kind' = 'avocado_notice';
