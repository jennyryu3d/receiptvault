-- migrate-6.sql — 같이 쓰는 사람이 생기기 전에 막아야 하는 것들
--
-- 보안 점검에서 실제로 재현된 두 가지를 고친다. 남편 한 사람이면 큰일은 아니지만,
-- 교회 모임처럼 아는 사이가 아닌 사람이 섞이면 그때는 늦다.
--
--   1) 초대는 '보기만' 으로 했는데 받는 쪽이 '주인' 으로 들어올 수 있었다.
--      정책이 "초대장이 있느냐" 만 보고 "무슨 역할로 초대됐느냐" 는 안 봤다.
--   2) 초대장이 브라우저에서만 지워졌다. 안 지우고 버티면 나중에 내보내도
--      같은 초대장으로 다시 들어올 수 있었다.
--
-- 이 파일은 여러 번 실행해도 안전하다.

-- ---------------------------------------------------------------
-- 1. 초대장에 적힌 역할만 받아들인다
-- ---------------------------------------------------------------

-- 초대장에 만료를 둔다. 안 쓰인 초대가 몇 년씩 살아 있을 이유가 없다.
alter table public.ledger_invites
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days');

-- 내 이메일 앞으로 온 초대장의 역할을 돌려준다. 없으면 null.
create or replace function public.invited_role(lid uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select i.role
  from public.ledger_invites i
  where i.ledger_id = lid
    and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and (i.expires_at is null or i.expires_at > now())
  limit 1
$$;

-- has_invite 도 만료를 보게 한다 (이 함수는 다른 정책들도 쓴다)
create or replace function public.has_invite(lid uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.ledger_invites
    where ledger_id = lid
      and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (expires_at is null or expires_at > now())
  )
$$;

drop policy if exists "member join" on public.ledger_members;
create policy "member join" on public.ledger_members
  for insert with check (
    user_id = auth.uid()
    and (
      -- 장부 주인이 자기 자신을 넣는 경우 (장부를 처음 만들 때)
      (public.is_ledger_owner(ledger_id) and role = 'owner')
      -- 초대받아 들어오는 경우 — 초대장에 적힌 역할 그대로만
      or role = public.invited_role(ledger_id)
    )
  );

-- ---------------------------------------------------------------
-- 2. 초대장은 서버가 소비한다
-- ---------------------------------------------------------------
-- 브라우저에 맡기면 "안 지우고 버티기" 가 가능하다. 합류와 초대장 삭제를
-- 한 덩어리로 묶어서, 들어온 순간 초대장이 반드시 없어지게 한다.

create or replace function public.rv_claim_invites()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  inv record;
  joined integer := 0;
begin
  if me is null or my_email = '' then
    return 0;
  end if;

  for inv in
    select * from public.ledger_invites
    where lower(email) = my_email
      and (expires_at is null or expires_at > now())
  loop
    insert into public.ledger_members (ledger_id, user_id, email, role)
    values (inv.ledger_id, me, coalesce(auth.jwt() ->> 'email', ''), inv.role)
    on conflict (ledger_id, user_id) do nothing;
    if found then joined := joined + 1; end if;
    -- 들어갔든 이미 있었든 초대장은 여기서 없어진다
    delete from public.ledger_invites where id = inv.id;
  end loop;

  -- 만료된 초대장도 같이 치운다
  delete from public.ledger_invites
   where lower(email) = my_email and expires_at <= now();

  return joined;
end;
$$;

revoke all on function public.rv_claim_invites() from public;
grant execute on function public.rv_claim_invites() to authenticated;

-- ---------------------------------------------------------------
-- 3. 입력자(created_by)는 나중에 못 바꾼다
-- ---------------------------------------------------------------
-- "누가 넣었나" 가 고쳐질 수 있으면 같이 쓰는 장부에서 기록의 의미가 없어진다.

create or replace function public.rv_keep_created_by()
returns trigger
language plpgsql
as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;

drop trigger if exists rv_receipts_keep_created_by on public.receipts;
create trigger rv_receipts_keep_created_by
  before update on public.receipts
  for each row execute function public.rv_keep_created_by();

-- ---------------------------------------------------------------
-- 4. AI 프록시는 이 장부들을 쓰는 사람만
-- ---------------------------------------------------------------
-- 지금은 이 Supabase 프로젝트에 가입만 하면 하루 한도를 쓸 수 있다.
-- 아무 장부에도 속하지 않은 계정은 AI를 못 쓰게 막는다.

-- migrate-2.sql 의 함수를 그대로 두고 "장부가 있는 사람만" 한 줄을 더한다.
-- 한도 값과 반환 모양은 건드리지 않는다 — worker.js 가 그 모양을 읽는다.
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

  -- 어느 장부에도 속하지 않은 계정은 이 앱의 사용자가 아니다.
  -- 이게 없으면 이 Supabase 프로젝트에 가입만 한 사람이 하루 한도를 태워
  -- 정작 우리는 인식을 못 쓰게 만들 수 있다.
  if not exists (select 1 from public.ledger_members where user_id = uid) then
    return json_build_object('ok', false, 'reason', 'no_ledger');
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

revoke all on function public.rv_ai_use(uuid) from public;
grant execute on function public.rv_ai_use(uuid) to authenticated;
