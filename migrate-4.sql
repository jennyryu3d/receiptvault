-- ===============================================================
-- migrate-4.sql — 장부에 "분류표(업종)" 칸을 더한다
--
-- Supabase → SQL Editor 에 붙여넣고 Run.
-- migrate-3.sql 을 먼저 돌린 뒤에 이걸 돌린다.
-- 여러 번 돌려도 안전하다.
-- ===============================================================

-- ---------------------------------------------------------------
-- 1. 분류표
--
-- 같은 '사업' 장부라도 업종에 따라 고르는 목록이 다르다.
--   leather → 가죽공방 (만들어 판다: 가죽·부자재·공구)
--   retail  → 판매·리셀 (사서 판다: 상품 매입·플랫폼 수수료·창고)
-- 어느 쪽이든 Schedule C 로 나가는 건 같다. 목록만 다르다.
--
-- 값의 목록은 앱의 categories.js 가 가지고 있다. 여기서 check 로 묶지 않는 이유:
-- 업종을 하나 늘릴 때마다 SQL 을 다시 돌려야 하면 그게 병목이 된다.
-- 없는 값이 들어와도 앱이 기본 분류표로 떨어지게 만들어 뒀다.
-- ---------------------------------------------------------------
alter table public.ledgers
  add column if not exists cat_set text;

-- 이미 있는 장부는 종류에 맞는 기본 분류표로 채운다
update public.ledgers set cat_set = 'leather' where cat_set is null and kind = 'business';
update public.ledgers set cat_set = 'remodel' where cat_set is null and kind = 'property';

-- ---------------------------------------------------------------
-- 2. 장부 종류 제약 풀기
--
-- migrate-3 에서 kind 를 ('business','property') 로 묶어뒀는데,
-- 앞으로 종류를 늘릴 때(개인 기록, 임대 부동산 등) SQL 을 다시 돌리지 않아도 되게
-- 제약을 없앤다. 어떤 값이 유효한지는 앱의 RV_PROFILES 가 정한다.
-- 모르는 값이 들어오면 앱은 기본 종류로 보여주고, 자료는 그대로 남는다.
-- ---------------------------------------------------------------
alter table public.ledgers drop constraint if exists ledgers_kind_check;

-- ---------------------------------------------------------------
-- 확인
-- ---------------------------------------------------------------
select id, name, kind, cat_set from public.ledgers order by created_at;
