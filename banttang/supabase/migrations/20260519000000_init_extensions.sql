-- 위치 쿼리는 PostGIS로 처리 (CLAUDE.md §5).
-- citext: 이메일/닉네임 비교용. pgcrypto: gen_random_uuid().
create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "postgis";
