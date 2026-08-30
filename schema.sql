-- ReceiptVault — Supabase schema
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run 하면 끝.
-- 여러 번 실행해도 안전하게 짜여 있다.
--
-- 구조 한눈에:
--   ledgers          장부 한 권. 부부가 하나를 같이 본다.
--   ledger_members   그 장부를 볼 수 있는 사람들 (owner / editor / viewer)
--   ledger_invites   아직 로그인한 적 없는 사람을 이메일로 미리 초대해 두는 곳
--   receipts         영수증. ledger_id 로 장부에 매달리고, created_by 로 입력자를 남긴다


-- ===============================================================
-- 0. 장부와 사람
-- ===============================================================
create table if not exists public.ledgers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null default '우리 공방',
  owner_id       uuid not null references auth.users(id) on delete cascade,

  -- 세무사 제출용 보고서 머리말에 찍히는 값
  business_name  text,
  taxpayer_name  text,

  created_at     timestamptz not null default now()
);

create table if not exists public.ledger_members (
  ledger_id  uuid not null references public.ledgers(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text,                       -- 화면에 누구인지 보여주기 위한 사본
  role       text not null default 'editor' check (role in ('owner','editor','viewer')),
  joined_at  timestamptz not null default now(),
  primary key (ledger_id, user_id)
);

create table if not exists public.ledger_invites (
  id         uuid primary key default gen_random_uuid(),
  ledger_id  uuid not null references public.ledgers(id) on delete cascade,
  email      text not null,
  role       text not null default 'editor' check (role in ('editor','viewer')),
  created_at timestamptz not null default now(),
  unique (ledger_id, email)
);


-- ===============================================================
-- 1. 권한 판정 함수
-- ===============================================================
-- 왜 함수로 빼는가: ledger_members 의 보안 규칙 안에서 다시 ledger_members 를
-- 조회하면 무한 재귀에 빠진다. security definer 함수는 규칙을 우회해서 읽으므로
-- 그 고리를 끊어준다. 대신 함수 안에서 auth.uid() 로 본인 것만 보도록 좁혀 둔다.

create or replace function public.my_ledger_ids()
returns setof uuid
language sql security definer stable
set search_path = public
as $$
  select ledger_id from public.ledger_members where user_id = auth.uid()
$$;

create or replace function public.is_ledger_owner(lid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.ledgers where id = lid and owner_id = auth.uid()
  )
$$;

create or replace function public.can_write_ledger(lid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.ledger_members
    where ledger_id = lid and user_id = auth.uid() and role in ('owner','editor')
  )
$$;

-- 내 이메일 앞으로 온 초대가 있는가 (합류할 때 한 번 쓴다)
create or replace function public.has_invite(lid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.ledger_invites
    where ledger_id = lid
      and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

-- 사진 경로의 첫 폴더가 내가 볼 수 있는 장부인가.
-- uuid 가 아닌 이상한 경로가 들어와도 예외 없이 false 를 돌려준다.
create or replace function public.can_read_ledger_path(p text)
returns boolean
language plpgsql security definer stable
set search_path = public
as $$
declare lid uuid;
begin
  begin
    lid := p::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1 from public.ledger_members where ledger_id = lid and user_id = auth.uid()
  );
end
$$;

create or replace function public.can_write_ledger_path(p text)
returns boolean
language plpgsql security definer stable
set search_path = public
as $$
declare lid uuid;
begin
  begin
    lid := p::uuid;
  exception when others then
    return false;
  end;
  return public.can_write_ledger(lid);
end
$$;


-- ===============================================================
-- 2. 영수증
-- ===============================================================
create table if not exists public.receipts (
  id            uuid primary key default gen_random_uuid(),
  ledger_id     uuid not null references public.ledgers(id) on delete cascade,
  created_by    uuid not null references auth.users(id),

  purchased_at  date not null,                 -- 거래일
  merchant      text not null default '',      -- 가맹점
  merchant_en   text,                          -- 세무사용 영문 표기 (없으면 merchant 를 그대로 씀)
  notes_en      text,                          -- 세무사용 영문 메모
  category      text not null default 'other', -- js/categories.js 의 key
  total         numeric(12,2) not null default 0,
  tax           numeric(12,2),                 -- sales tax (알면 기록, 몰라도 됨)
  currency      text not null default 'USD',
  payment_method text,

  -- 사업 사용 비율. 차량처럼 개인/사업 겸용인 지출에만 100 미만을 쓴다.
  business_pct  int not null default 100 check (business_pct between 0 and 100),

  -- 분할: 한 영수증을 여러 분류로 쪼갤 때.
  --   null 또는 [] → category 하나로 total 전액
  --   [{"category":"cogs_material","amount":120.50,"note":"가죽"}, ...]
  -- 별도 표 대신 jsonb 를 쓴 이유: 조인도 두 번째 보안 규칙도 필요 없고,
  -- 영수증 한 건을 읽으면 분할까지 통째로 따라온다.
  splits        jsonb,

  notes         text,
  source        text not null default 'manual'
                check (source in ('manual','photo','screenshot')),
  -- 대표 사진 = AI가 읽고, 목록·PDF에 나오는 장.
  -- 한 거래에 종이가 여러 장인 경우(손으로 쓴 명세 여러 장 + 카드 전표)가 있어서
  -- 나머지 증빙은 extra_paths 에 순서대로 들어간다.
  image_path    text,
  extra_paths   text[] not null default '{}',
  ai_raw        jsonb,
  needs_review  boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 이미 만들어 둔 뒤 이 파일을 다시 돌리는 경우를 위해
-- 세무사에게 나가는 자료는 영문이어야 한다. 한글 영수증의 영문 표기를 따로 담는다.
alter table public.receipts add column if not exists merchant_en text;
alter table public.receipts add column if not exists notes_en    text;

alter table public.receipts add column if not exists splits     jsonb;
alter table public.receipts add column if not exists ledger_id  uuid references public.ledgers(id) on delete cascade;
alter table public.receipts add column if not exists created_by uuid references auth.users(id);

create index if not exists receipts_ledger_date_idx
  on public.receipts (ledger_id, purchased_at desc);
create index if not exists receipts_ledger_category_idx
  on public.receipts (ledger_id, category);
create index if not exists ledger_members_user_idx
  on public.ledger_members (user_id);
create index if not exists ledger_invites_email_idx
  on public.ledger_invites (lower(email));

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists receipts_touch_updated_at on public.receipts;
create trigger receipts_touch_updated_at
  before update on public.receipts
  for each row execute function public.touch_updated_at();


-- ===============================================================
-- 3. 보안 규칙 (RLS)
-- ===============================================================
alter table public.ledgers        enable row level security;
alter table public.ledger_members enable row level security;
alter table public.ledger_invites enable row level security;
alter table public.receipts       enable row level security;

-- ---- ledgers ----
-- owner_id 조건이 왜 따로 필요한가: 장부를 막 만든 순간에는 아직 식구 명단에
-- 이름이 없다. 식구 조건만 두면 방금 만든 장부를 자기가 못 읽어서 생성이 실패한다.
drop policy if exists "ledger read" on public.ledgers;
create policy "ledger read" on public.ledgers
  for select using (
    owner_id = auth.uid() or id in (select public.my_ledger_ids())
  );

drop policy if exists "ledger create" on public.ledgers;
create policy "ledger create" on public.ledgers
  for insert with check (owner_id = auth.uid());

drop policy if exists "ledger update" on public.ledgers;
create policy "ledger update" on public.ledgers
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "ledger delete" on public.ledgers;
create policy "ledger delete" on public.ledgers
  for delete using (owner_id = auth.uid());

-- ---- ledger_members ----
drop policy if exists "member read" on public.ledger_members;
create policy "member read" on public.ledger_members
  for select using (ledger_id in (select public.my_ledger_ids()));

-- 들어오는 길은 두 가지뿐이다:
--   1) 내가 방금 만든 장부에 나를 owner 로 넣는 경우
--   2) 내 이메일 앞으로 온 초대를 받아 나를 넣는 경우
-- 어느 쪽이든 남을 마음대로 끼워 넣을 수는 없다.
drop policy if exists "member join" on public.ledger_members;
create policy "member join" on public.ledger_members
  for insert with check (
    user_id = auth.uid()
    and (public.is_ledger_owner(ledger_id) or public.has_invite(ledger_id))
  );

drop policy if exists "member update" on public.ledger_members;
create policy "member update" on public.ledger_members
  for update using (public.is_ledger_owner(ledger_id));

-- 주인은 누구든 내보낼 수 있고, 누구나 스스로 나갈 수 있다.
drop policy if exists "member leave" on public.ledger_members;
create policy "member leave" on public.ledger_members
  for delete using (public.is_ledger_owner(ledger_id) or user_id = auth.uid());

-- ---- ledger_invites ----
drop policy if exists "invite read" on public.ledger_invites;
create policy "invite read" on public.ledger_invites
  for select using (
    public.is_ledger_owner(ledger_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "invite create" on public.ledger_invites;
create policy "invite create" on public.ledger_invites
  for insert with check (public.is_ledger_owner(ledger_id));

drop policy if exists "invite delete" on public.ledger_invites;
create policy "invite delete" on public.ledger_invites
  for delete using (
    public.is_ledger_owner(ledger_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ---- receipts ----
drop policy if exists "receipt read" on public.receipts;
create policy "receipt read" on public.receipts
  for select using (ledger_id in (select public.my_ledger_ids()));

drop policy if exists "receipt create" on public.receipts;
create policy "receipt create" on public.receipts
  for insert with check (public.can_write_ledger(ledger_id) and created_by = auth.uid());

drop policy if exists "receipt update" on public.receipts;
create policy "receipt update" on public.receipts
  for update using (public.can_write_ledger(ledger_id))
  with check (public.can_write_ledger(ledger_id));

drop policy if exists "receipt delete" on public.receipts;
create policy "receipt delete" on public.receipts
  for delete using (public.can_write_ledger(ledger_id));


-- ===============================================================
-- 4. 영수증 사진 저장소 (비공개 버킷)
-- ===============================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- 파일 경로 규칙: {ledger_id}/{receipt_id}.jpg
-- 경로의 첫 폴더가 곧 권한이다. 장부 식구면 보이고, 아니면 없는 파일이 된다.
drop policy if exists "own receipt files read"   on storage.objects;
drop policy if exists "own receipt files write"  on storage.objects;
drop policy if exists "own receipt files update" on storage.objects;
drop policy if exists "own receipt files delete" on storage.objects;

drop policy if exists "ledger files read" on storage.objects;
create policy "ledger files read" on storage.objects
  for select using (
    bucket_id = 'receipts' and public.can_read_ledger_path((storage.foldername(name))[1])
  );

drop policy if exists "ledger files write" on storage.objects;
create policy "ledger files write" on storage.objects
  for insert with check (
    bucket_id = 'receipts' and public.can_write_ledger_path((storage.foldername(name))[1])
  );

drop policy if exists "ledger files update" on storage.objects;
create policy "ledger files update" on storage.objects
  for update using (
    bucket_id = 'receipts' and public.can_write_ledger_path((storage.foldername(name))[1])
  );

drop policy if exists "ledger files delete" on storage.objects;
create policy "ledger files delete" on storage.objects
  for delete using (
    bucket_id = 'receipts' and public.can_write_ledger_path((storage.foldername(name))[1])
  );
