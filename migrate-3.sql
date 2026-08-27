-- ===============================================================
-- migrate-3.sql — 장부 여러 개 + 장부 종류 + 결제 수단 기록
--
-- Supabase → SQL Editor 에 붙여넣고 Run.
-- 이미 있는 자료는 건드리지 않는다. 지금 있는 장부는 전부 'business' 가 된다.
-- 여러 번 돌려도 안전하다.
-- ===============================================================

-- ---------------------------------------------------------------
-- 1. 장부 종류
--
-- 'business' → 공방처럼 그 해에 공제받는 장부 (Schedule C)
-- 'property' → 집 리모델링처럼 공제가 아니라 집의 취득원가(cost basis)에
--              쌓이는 장부. 집을 팔 때 양도차익에서 빠진다.
--
-- 분류표도 보고서도 이 값에 따라 갈린다. 만든 뒤에는 바꾸지 않는 걸 전제로 한다
-- (바꾸면 이미 넣은 영수증의 분류가 다른 표의 것이 되어 버린다).
-- ---------------------------------------------------------------
alter table public.ledgers
  add column if not exists kind text not null default 'business';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ledgers_kind_check'
  ) then
    alter table public.ledgers
      add constraint ledgers_kind_check check (kind in ('business', 'property'));
  end if;
end $$;

-- ---------------------------------------------------------------
-- 2. 결제 수단 표기
--
-- payment_method 는 종류(카드/현금/이체)고, payment_ref 는 "어느 카드였나" 다.
-- 세무사와 회계사가 카드 명세서와 대조할 때 이게 있어야 한 줄씩 맞출 수 있다.
--
-- 카드번호 전체는 저장하지 않는다. AI에게도 끝 4자리만 남기라고 지시한다.
-- 'Visa ...4821' 처럼 짧은 표기만 들어간다.
-- ---------------------------------------------------------------
alter table public.receipts
  add column if not exists payment_ref text;

-- 입력할 때 예전에 쓴 표기를 보여주기 위한 색인
create index if not exists receipts_payment_ref_idx
  on public.receipts (ledger_id, payment_ref);

-- ---------------------------------------------------------------
-- 확인
-- ---------------------------------------------------------------
select id, name, kind from public.ledgers order by created_at;
