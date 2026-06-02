-- ----------------------------------------------------------------------------
-- find_or_create_neighborhood — 유저가 고른 위치의 동네를 찾거나 없으면 생성
-- ----------------------------------------------------------------------------
-- 정책: 동네를 미리 다 시드하지 않고, 사용자가 위치를 설정하는 순간 그 (시,구,동)이
--       neighborhoods에 없으면 그때 생성한다(on-demand). 생성된 동네는 is_active=true.
-- 거리/좌표는 PostGIS로 저장 (설계 원칙 5). POINT는 (lng, lat) 순서.
-- (city, district, name) UNIQUE 제약을 이용한 upsert로 동시성에도 안전하게 단일 row 보장.

-- 초기에 검토했던 "가장 가까운 활성 동네" 방식은 폐기 — 혹시 적용됐다면 정리.
drop function if exists nearest_active_neighborhood(double precision, double precision);

create or replace function find_or_create_neighborhood(
    p_city     text,
    p_district text,
    p_name     text,
    p_lat      double precision,
    p_lng      double precision
)
returns uuid
language plpgsql
as $$
declare
    v_id uuid;
begin
    insert into neighborhoods (name, district, city, center_point, is_active)
    values (
        p_name, p_district, p_city,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        true
    )
    on conflict (city, district, name) do update set updated_at = now()
    returning id into v_id;

    return v_id;
end;
$$;

comment on function find_or_create_neighborhood(text, text, text, double precision, double precision)
    is '유저가 설정한 위치 (시,구,동)으로 동네를 찾거나 없으면 생성하고 id 반환. 생성 시 is_active=true.';

grant execute on function find_or_create_neighborhood(text, text, text, double precision, double precision)
    to authenticated, service_role;
