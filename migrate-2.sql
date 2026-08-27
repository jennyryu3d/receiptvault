-- ReceiptVault 업데이트 2 — 통화·환율·국가·사용량 제한
-- Supabase SQL Editor 에 통째로 붙여넣고 Run. 여러 번 돌려도 안전하다.

-- ===============================================================
-- 1. 영수증에 새 칸
-- ===============================================================
-- 통화가 둘로 나뉜다:
--   amount_original + currency  = 영수증에 찍힌 그대로 (예: 36100 KRW)
--   total                       = 미국 신고에 쓰는 USD 환산액
-- 리포트와 세무사 자료는 전부 total(USD)로 계산한다.
alter table public.receipts add column if not exists amount_original numeric(14,2);
alter table public.receipts add column if not exists fx_rate         numeric(18,8);
alter table public.receipts add column if not exists fx_rate_date    date;
-- fx_source: 'ecb'(공시 환율 자동) | 'manual'(카드 청구액으로 직접) | 'same'(원래 USD)
alter table public.receipts add column if not exists fx_source       text;
-- 구입한 나라. ISO 2글자 (US, KR ...)
alter table public.receipts add column if not exists country         text;

-- 기존 영수증은 전부 USD 로 넣은 것들이므로 그에 맞게 채워준다
update public.receipts
   set amount_original = coalesce(amount_original, total),
       fx_rate         = coalesce(fx_rate, 1),
       fx_source       = coalesce(fx_source, 'same'),
       country         = coalesce(country, 'US')
 where amount_original is null or fx_rate is null or fx_source is null or country is null;


-- ===============================================================
-- 2. AI 사용량 기록
-- ===============================================================
-- 영수증 인식을 한 번 할 때마다 한 줄. 하루 몇 장 썼는지 세는 용도다.
create table if not exists public.ai_usage (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  ledger_id  uuid references public.ledgers(id) on delete set null,
  day        date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_day_idx      on public.ai_usage (day);
create index if not exists ai_usage_user_day_idx on public.ai_usage (user_id, day);

alter table public.ai_usage enable row level security;

-- 본인 사용량만 조회 가능. 넣는 건 아래 함수만 한다.
drop policy if exists "own usage read" on public.ai_usage;
create policy "own usage read" on public.ai_usage
  for select using (user_id = auth.uid());


-- ===============================================================
-- 3. 한도 검사 + 기록 (한 번에)
-- ===============================================================
-- 한도를 바꾸려면 아래 두 숫자만 고치고 이 블록을 다시 Run 하면 된다.
--   PER_USER  : 한 사람이 하루에 인식할 수 있는 영수증 수
--   GLOBAL    : 전체 사용자를 합쳐 하루 최대
--
-- 왜 함수 하나로 묶었나: "세어보고 → 괜찮으면 기록" 을 따로 하면 그 사이에
-- 여러 요청이 몰릴 때 한도를 넘겨버린다. 한 트랜잭션 안에서 처리해야 안 샌다.
create or replace function public.rv_ai_use(p_ledger uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  PER_USER constant int := 50;
  GLOBAL   constant int := 300;
  uid      uuid := auth.uid();
  today    date := (now() at time zone 'utc')::date;
  n_user   int;
  n_global int;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select count(*) into n_user   from public.ai_usage where user_id = uid and day = today;
  select count(*) into n_global from public.ai_usage where day = today;

  if n_user >= PER_USER then
    return json_build_object('ok', false, 'reason', 'user_limit',
                             'used', n_user, 'limit', PER_USER);
  end if;

  if n_global >= GLOBAL then
    return json_build_object('ok', false, 'reason', 'global_limit',
                             'used', n_global, 'limit', GLOBAL);
  end if;

  insert into public.ai_usage (user_id, ledger_id) values (uid, p_ledger);

  return json_build_object('ok', true,
                           'used', n_user + 1, 'limit', PER_USER,
                           'global_used', n_global + 1, 'global_limit', GLOBAL);
end
$$;

-- 로그인한 사용자만 호출할 수 있게
revoke all on function public.rv_ai_use(uuid) from public;
grant execute on function public.rv_ai_use(uuid) to authenticated;

-- 오늘 얼마나 썼는지 화면에 보여주기 위한 조회용
create or replace function public.rv_ai_quota()
returns json
language sql security definer
set search_path = public
as $$
  select json_build_object(
    'used',  (select count(*) from public.ai_usage
               where user_id = auth.uid() and day = (now() at time zone 'utc')::date),
    'limit', 50
  )
$$;

revoke all on function public.rv_ai_quota() from public;
grant execute on function public.rv_ai_quota() to authenticated;
