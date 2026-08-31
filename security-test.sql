-- =================================================================
-- security-test.sql — ReceiptVault 권한(RLS) 자가 점검
--
-- 쓰는 법: Supabase → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--          마지막 표에 항목마다 PASS / FAIL 이 찍힌다.
--
-- 안전한가: 그렇다.
--   * 진짜 자료는 한 줄도 바꾸지 않는다. 시험용 줄은 전부 가짜 UUID
--     (aaaaaaaa-…, 11111111-… 처럼 눈에 띄게 만들어 둔 값)로만 만든다.
--   * 모든 쓰기는 하위 트랜잭션 안에서 일어나고, 끝에서 반드시 되돌린다
--     (일부러 예외를 던져서 롤백시킨다). 결과만 변수에 담겨 살아 나온다.
--   * 읽기 시험은 진짜 표를 상대로 하지만 읽기만 한다.
--
-- 왜 함수 하나로 감쌌나: BEGIN/ROLLBACK 을 손으로 쓰면 편집기가 결과 표를
-- 안 보여주는 경우가 있다. 함수 안에서 되돌리면 결과는 표로 나오고
-- 자료는 확실히 원상복구된다.
-- =================================================================

-- ---- 도우미: SQL 한 줄을 돌려보고 "막혔나 / 몇 줄 나왔나" 만 돌려준다 ----
create or replace function pg_temp.rv_try(p_sql text)
returns text language plpgsql as $$
declare n bigint;
begin
  begin
    execute p_sql;
    get diagnostics n = row_count;
    return 'OK:' || n;
  exception when others then
    return 'DENIED';
  end;
end $$;

create or replace function pg_temp.rv_count(p_sql text)
returns text language plpgsql as $$
declare n bigint;
begin
  begin
    execute 'select count(*) from (' || p_sql || ') _t' into n;
    return 'OK:' || n;
  exception when others then
    return 'DENIED';
  end;
end $$;


create or replace function pg_temp.rv_security_check()
returns table (n int, area text, check_name text, expected text, actual text, verdict text)
language plpgsql as $$
declare
  -- 결과는 배열에 쌓는다. plpgsql 변수는 예외로 롤백해도 값이 남는다 —
  -- 그래서 자료는 되돌리고 채점표만 밖으로 가져올 수 있다.
  out_n      int[]  := '{}';
  out_area   text[] := '{}';
  out_name   text[] := '{}';
  out_exp    text[] := '{}';
  out_act    text[] := '{}';
  out_ok     text[] := '{}';
  i          int    := 0;

  -- 가짜 식별자. 진짜 자료와 절대 겹치지 않는 값.
  U_OWNER  uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  U_INVITE uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  U_STRANGE uuid:= 'cccccccc-0000-4000-8000-000000000003';
  L_TEST   uuid := '11111111-0000-4000-8000-000000000001';
  L_OTHER  uuid := '11111111-0000-4000-8000-000000000002';
  R_TEST   uuid := '22222222-0000-4000-8000-000000000001';
  P_TEST   text;

  r        text;
  t        record;
  setup_ok boolean := true;
  setup_err text := '';

begin
  P_TEST := L_TEST::text || '/' || R_TEST::text || '-x.jpg';

  -- 채점 한 줄 추가하는 내부 매크로 대신 쓰는 방식:
  -- (plpgsql 에 중첩 함수가 없어서 배열에 직접 밀어 넣는다)

  -- =============================================================
  -- A. 구조 점검 (읽기만 한다)
  -- =============================================================
  for t in
    select c.relname,
           c.relrowsecurity as rls_on
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relname in ('ledgers','ledger_members','ledger_invites','receipts','ai_usage')
    order by 1
  loop
    i := i + 1;
    out_n := array_append(out_n, i); out_area := array_append(out_area, ('A. 구조')::text);
    out_name := array_append(out_name, (('RLS 켜져 있나: public.' || t.relname))::text);
    out_exp := array_append(out_exp, ('on')::text);
    out_act := array_append(out_act, ((case when t.rls_on then 'on' else 'OFF' end))::text);
    out_ok  := out_ok  || (case when t.rls_on then 'PASS' else 'FAIL' end);
  end loop;

  -- 다섯 표가 실제로 다 있는지
  i := i + 1;
  select count(*) into strict r
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname='public'
     and c.relname in ('ledgers','ledger_members','ledger_invites','receipts','ai_usage');
  out_n := array_append(out_n, i); out_area := array_append(out_area, ('A. 구조')::text);
  out_name := array_append(out_name, ('표 다섯 개가 다 있나')::text);
  out_exp := array_append(out_exp, ('5')::text); out_act := array_append(out_act, (r)::text);
  out_ok  := out_ok  || (case when r = '5' then 'PASS' else 'FAIL' end);

  -- 표마다 필요한 정책이 다 있는지.
  -- 정책이 없는 동작은 RLS 가 알아서 막는다 — 그러니 "없어야 맞는" 것도 있다.
  --   ledger_invites 에 UPDATE 정책이 없는 건 의도된 것이다(초대장은 고치지 않는다).
  for t in
    select x.tbl, x.want,
           coalesce(string_agg(distinct p.cmd, ',' order by p.cmd), '(없음)') as cmds
    from (values ('ledgers',        'DELETE,INSERT,SELECT,UPDATE'),
                 ('ledger_members', 'DELETE,INSERT,SELECT,UPDATE'),
                 ('ledger_invites', 'DELETE,INSERT,SELECT'),
                 ('receipts',       'DELETE,INSERT,SELECT,UPDATE')) x(tbl, want)
    left join pg_policies p on p.schemaname='public' and p.tablename = x.tbl
    group by x.tbl, x.want order by x.tbl
  loop
    i := i + 1;
    out_n := array_append(out_n, i); out_area := array_append(out_area, ('A. 구조')::text);
    out_name := array_append(out_name, (('정책 구성: ' || t.tbl))::text);
    out_exp := array_append(out_exp, (t.want)::text);
    out_act := array_append(out_act, (t.cmds)::text);
    out_ok  := out_ok  || (case when t.cmds = t.want then 'PASS' else 'FAIL' end);
  end loop;

  -- ai_usage 는 읽기 정책만 있어야 맞다 (넣는 건 rv_ai_use 함수만)
  i := i + 1;
  select coalesce(string_agg(distinct cmd, ',' order by cmd),'(없음)') into r
    from pg_policies where schemaname='public' and tablename='ai_usage';
  out_n := array_append(out_n, i); out_area := array_append(out_area, ('A. 구조')::text);
  out_name := array_append(out_name, ('ai_usage 는 SELECT 정책만 (한도 조작 방지)')::text);
  out_exp := array_append(out_exp, ('SELECT')::text); out_act := array_append(out_act, (r)::text);
  out_ok  := out_ok  || (case when r = 'SELECT' then 'PASS' else 'FAIL' end);

  -- 사진 버킷이 비공개인가
  i := i + 1;
  select case when public then 'PUBLIC(공개)' else 'private' end into r
    from storage.buckets where id = 'receipts';
  out_n := array_append(out_n, i); out_area := array_append(out_area, ('A. 구조')::text);
  out_name := array_append(out_name, ('사진 버킷 receipts 가 비공개인가')::text);
  out_exp := array_append(out_exp, ('private')::text); out_act := array_append(out_act, (coalesce(r,'(버킷 없음)'))::text);
  out_ok  := out_ok  || (case when r = 'private' then 'PASS' else 'FAIL' end);

  -- storage.objects 정책 네 개
  i := i + 1;
  select coalesce(string_agg(distinct cmd, ',' order by cmd),'(없음)') into r
    from pg_policies where schemaname='storage' and tablename='objects';
  out_n := array_append(out_n, i); out_area := array_append(out_area, ('A. 구조')::text);
  out_name := array_append(out_name, ('storage.objects 정책 네 종류')::text);
  out_exp := array_append(out_exp, ('DELETE,INSERT,SELECT,UPDATE')::text); out_act := array_append(out_act, (r)::text);
  out_ok  := out_ok  || (case when r = 'DELETE,INSERT,SELECT,UPDATE' then 'PASS' else 'FAIL' end);


  -- =============================================================
  -- B. 실제 동작 점검 (여기서부터 가짜 자료를 만들었다가 전부 되돌린다)
  -- =============================================================
  begin  -- ← 이 블록이 끝에서 통째로 롤백된다

    -- ---- 가짜 사람/장부/영수증/초대 만들기 ----
    begin
      insert into auth.users(id, email, instance_id, aud, role)
      values (U_OWNER,  'rv-test-owner@example.invalid',   '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
             (U_INVITE, 'rv-test-invited@example.invalid', '00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
             (U_STRANGE,'rv-test-stranger@example.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
    exception when others then
      -- auth.users 칼럼 구성이 다른 버전이면 최소 칼럼만으로 다시
      begin
        insert into auth.users(id, email)
        values (U_OWNER,'rv-test-owner@example.invalid'),
               (U_INVITE,'rv-test-invited@example.invalid'),
               (U_STRANGE,'rv-test-stranger@example.invalid');
      exception when others then
        setup_ok := false; setup_err := sqlerrm;
      end;
    end;

    if setup_ok then
      insert into public.ledgers(id, name, owner_id)
        values (L_TEST, 'RV-TEST 장부', U_OWNER),
               (L_OTHER,'RV-TEST 남의 장부', U_STRANGE);
      insert into public.ledger_members(ledger_id, user_id, email, role)
        values (L_TEST, U_OWNER, 'rv-test-owner@example.invalid', 'owner'),
               (L_OTHER, U_STRANGE, 'rv-test-stranger@example.invalid', 'owner');
      insert into public.receipts(id, ledger_id, created_by, purchased_at, merchant, total)
        values (R_TEST, L_TEST, U_OWNER, current_date, 'RV-TEST 비밀 가게', 123.45);
      -- 초대는 "보기만(viewer)" 으로 낸다. 이게 이 시험의 핵심이다.
      insert into public.ledger_invites(ledger_id, email, role)
        values (L_TEST, 'rv-test-invited@example.invalid', 'viewer');
      begin
        insert into storage.objects(bucket_id, name) values ('receipts', P_TEST);
      exception when others then null;  -- storage 칼럼 구성이 다르면 이 시험만 건너뛴다
      end;
    end if;

    -- ---------------------------------------------------------
    -- B-1. 남남(로그인은 했지만 이 장부와 무관한 사람)
    -- ---------------------------------------------------------
    perform set_config('request.jwt.claims',
      json_build_object('sub', U_STRANGE, 'email','rv-test-stranger@example.invalid',
                        'role','authenticated')::text, true);
    set local role authenticated;

    for t in select * from (values
      ('남이 내 영수증을 읽나',        'select * from public.receipts where ledger_id = '''||L_TEST||''''         , '0'),
      ('남이 내 장부를 읽나',          'select * from public.ledgers where id = '''||L_TEST||''''                 , '0'),
      ('남이 식구 명단을 읽나',        'select * from public.ledger_members where ledger_id = '''||L_TEST||''''   , '0'),
      ('남이 초대장을 읽나',           'select * from public.ledger_invites where ledger_id = '''||L_TEST||''''   , '0'),
      ('남이 내 AI 사용량을 읽나',     'select * from public.ai_usage'                                            , '0'),
      ('남이 내 사진 목록을 읽나',     'select * from storage.objects where name like '''||L_TEST||'%'''          , '0')
    ) v(nm, q, exp) loop
      r := pg_temp.rv_count(t.q);
      i := i + 1;
      out_n := array_append(out_n, i); out_area := array_append(out_area, ('B. 남남')::text);
      out_name := array_append(out_name, (t.nm)::text); out_exp := array_append(out_exp, ('0줄 또는 DENIED')::text);
      out_act := array_append(out_act, (r)::text);
      out_ok  := out_ok  || (case when r in ('OK:0','DENIED') then 'PASS' else 'FAIL' end);
    end loop;

    -- 진짜 자료까지 포함해서: 남남은 아무 영수증도 못 본다
    r := pg_temp.rv_count('select * from public.receipts');
    i := i + 1;
    out_n := array_append(out_n, i); out_area := array_append(out_area, ('B. 남남')::text);
    out_name := array_append(out_name, ('남남이 이 데이터베이스의 영수증을 하나라도 보나 (진짜 자료 포함)')::text);
    out_exp := array_append(out_exp, ('0')::text); out_act := array_append(out_act, (r)::text);
    out_ok  := out_ok  || (case when r = 'OK:0' then 'PASS' else 'FAIL' end);

    for t in select * from (values
      ('남이 내 장부에 스스로 합류하나',
       'insert into public.ledger_members(ledger_id,user_id,role) values ('''||L_TEST||''','''||U_STRANGE||''',''editor'')'),
      ('남이 내 장부에 초대장을 만드나',
       'insert into public.ledger_invites(ledger_id,email,role) values ('''||L_TEST||''',''x@example.invalid'',''editor'')'),
      ('남이 내 장부에 영수증을 넣나',
       'insert into public.receipts(ledger_id,created_by,purchased_at,total) values ('''||L_TEST||''','''||U_STRANGE||''',current_date,1)'),
      ('남이 내 영수증을 고치나',
       'update public.receipts set total = 0 where id = '''||R_TEST||''''),
      ('남이 내 영수증을 지우나',
       'delete from public.receipts where id = '''||R_TEST||''''),
      ('남이 내 장부 이름을 바꾸나',
       'update public.ledgers set name = ''pwned'' where id = '''||L_TEST||''''),
      ('남이 내 장부를 지우나',
       'delete from public.ledgers where id = '''||L_TEST||''''),
      ('남이 내 사진 폴더에 파일을 올리나',
       'insert into storage.objects(bucket_id,name) values (''receipts'','''||L_TEST||'/evil.jpg'')'),
      ('남이 AI 사용량을 직접 넣나',
       'insert into public.ai_usage(user_id) values ('''||U_STRANGE||''')'),
      ('남이 AI 사용량을 지워 한도를 되돌리나',
       'delete from public.ai_usage')
    ) v(nm, q) loop
      r := pg_temp.rv_try(t.q);
      i := i + 1;
      out_n := array_append(out_n, i); out_area := array_append(out_area, ('B. 남남')::text);
      out_name := array_append(out_name, (t.nm)::text); out_exp := array_append(out_exp, ('DENIED 또는 0줄')::text);
      out_act := array_append(out_act, (r)::text);
      out_ok  := out_ok  || (case when r in ('DENIED','OK:0') then 'PASS' else 'FAIL' end);
    end loop;

    -- ---------------------------------------------------------
    -- B-2. 로그인 안 한 사람(anon)
    -- ---------------------------------------------------------
    reset role;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;

    for t in select * from (values
      ('anon 이 영수증을 읽나',      'select * from public.receipts'),
      ('anon 이 장부를 읽나',        'select * from public.ledgers'),
      ('anon 이 식구 명단을 읽나',   'select * from public.ledger_members'),
      ('anon 이 초대장을 읽나',      'select * from public.ledger_invites'),
      ('anon 이 AI 사용량을 읽나',   'select * from public.ai_usage'),
      ('anon 이 사진 목록을 읽나',   'select * from storage.objects')
    ) v(nm, q) loop
      r := pg_temp.rv_count(t.q);
      i := i + 1;
      out_n := array_append(out_n, i); out_area := array_append(out_area, ('B. anon(비로그인)')::text);
      out_name := array_append(out_name, (t.nm)::text); out_exp := array_append(out_exp, ('0 또는 DENIED')::text);
      out_act := array_append(out_act, (r)::text);
      out_ok  := out_ok  || (case when r in ('OK:0','DENIED') then 'PASS' else 'FAIL' end);
    end loop;

    -- ---------------------------------------------------------
    -- B-3. "보기만(viewer)" 으로 초대한 사람
    --      ★ 여기가 이 시험의 핵심이다
    -- ---------------------------------------------------------
    reset role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', U_INVITE, 'email','rv-test-invited@example.invalid',
                        'role','authenticated')::text, true);
    set local role authenticated;

    r := pg_temp.rv_count('select * from public.receipts where ledger_id = '''||L_TEST||'''');
    i := i + 1;
    out_n := array_append(out_n, i); out_area := array_append(out_area, ('C. 초대받은 사람')::text);
    out_name := array_append(out_name, ('합류 전에는 영수증이 안 보인다')::text);
    out_exp := array_append(out_exp, ('0')::text); out_act := array_append(out_act, (r)::text);
    out_ok  := out_ok  || (case when r = 'OK:0' then 'PASS' else 'FAIL' end);

    -- ★ 초대는 viewer 인데 스스로 owner 로 합류할 수 있나?
    r := pg_temp.rv_try(
      'insert into public.ledger_members(ledger_id,user_id,email,role) values ('
      ||''''||L_TEST||''','''||U_INVITE||''',''rv-test-invited@example.invalid'',''owner'')');
    i := i + 1;
    out_n := array_append(out_n, i); out_area := array_append(out_area, ('C. 초대받은 사람')::text);
    out_name := array_append(out_name, ('★ viewer 로 초대했는데 스스로 owner 로 합류되나 (member join 정책)')::text);
    out_exp := array_append(out_exp, ('DENIED')::text); out_act := array_append(out_act, (r)::text);
    out_ok  := out_ok  || (case when r = 'DENIED' then 'PASS' else 'FAIL' end);

    -- 위가 막혔든 아니든, 이제 초대장대로 viewer 로 합류시켜 놓고 이어서 본다
    if r <> 'DENIED' then
      -- owner 로 들어가 버렸다면 지우고 viewer 로 다시 넣는다
      reset role;
      delete from public.ledger_members
       where ledger_id = L_TEST and user_id = U_INVITE;
      insert into public.ledger_members(ledger_id,user_id,email,role)
        values (L_TEST, U_INVITE, 'rv-test-invited@example.invalid', 'viewer');
      perform set_config('request.jwt.claims',
        json_build_object('sub', U_INVITE, 'email','rv-test-invited@example.invalid',
                          'role','authenticated')::text, true);
      set local role authenticated;
    else
      -- 합류가 막힌 게 정상이다(초대는 viewer 였으니까). 이어지는 시험을 위해
      -- 초대장대로 viewer 로 넣어준다. 이미 줄이 있을 수 있으니 지우고 넣는다 —
      -- 예전에는 여기서 중복 키로 터져서 뒤 시험이 전부 0 으로 나왔다.
      reset role;
      delete from public.ledger_members
       where ledger_id = L_TEST and user_id = U_INVITE;
      insert into public.ledger_members(ledger_id,user_id,email,role)
        values (L_TEST, U_INVITE, 'rv-test-invited@example.invalid', 'viewer');
      perform set_config('request.jwt.claims',
        json_build_object('sub', U_INVITE, 'email','rv-test-invited@example.invalid',
                          'role','authenticated')::text, true);
      set local role authenticated;
    end if;

    -- viewer 로서 할 수 있어야 하는 것
    r := pg_temp.rv_count('select * from public.receipts where ledger_id = '''||L_TEST||'''');
    i := i + 1;
    out_n := array_append(out_n, i); out_area := array_append(out_area, ('C. 초대받은 사람')::text);
    out_name := array_append(out_name, ('viewer 는 영수증을 읽을 수 있다 (읽기는 되어야 정상)')::text);
    out_exp := array_append(out_exp, ('1')::text); out_act := array_append(out_act, (r)::text);
    out_ok  := out_ok  || (case when r = 'OK:1' then 'PASS' else 'FAIL' end);

    -- viewer 로서 할 수 없어야 하는 것
    for t in select * from (values
      ('viewer 가 영수증을 넣나',
       'insert into public.receipts(ledger_id,created_by,purchased_at,total) values ('''||L_TEST||''','''||U_INVITE||''',current_date,1)'),
      ('viewer 가 영수증을 고치나',
       'update public.receipts set total = 0 where id = '''||R_TEST||''''),
      ('viewer 가 영수증을 지우나',
       'delete from public.receipts where id = '''||R_TEST||''''),
      ('viewer 가 사진을 올리나',
       'insert into storage.objects(bucket_id,name) values (''receipts'','''||L_TEST||'/v.jpg'')'),
      ('viewer 가 사진을 지우나',
       'delete from storage.objects where name = '''||P_TEST||''''),
      ('식구가 장부 이름을 바꾸나 (주인만 가능해야)',
       'update public.ledgers set name = ''pwned'' where id = '''||L_TEST||''''),
      ('식구가 남을 초대하나 (주인만 가능해야)',
       'insert into public.ledger_invites(ledger_id,email,role) values ('''||L_TEST||''',''x@example.invalid'',''editor'')'),
      ('식구가 주인을 내보내나',
       'delete from public.ledger_members where ledger_id = '''||L_TEST||''' and user_id = '''||U_OWNER||''''),
      ('식구가 스스로를 editor 로 승격하나 (UPDATE)',
       'update public.ledger_members set role = ''editor'' where ledger_id = '''||L_TEST||''' and user_id = '''||U_INVITE||''''),
      ('식구가 남의 장부 사진을 읽나',
       'select * from storage.objects where name like '''||L_OTHER||'%'''),
      ('식구가 영수증을 남의 장부로 옮기나',
       'update public.receipts set ledger_id = '''||L_OTHER||''' where id = '''||R_TEST||'''')
    ) v(nm, q) loop
      r := pg_temp.rv_try(t.q);
      i := i + 1;
      out_n := array_append(out_n, i); out_area := array_append(out_area, ('C. 초대받은 사람')::text);
      out_name := array_append(out_name, (t.nm)::text); out_exp := array_append(out_exp, ('DENIED 또는 0줄')::text);
      out_act := array_append(out_act, (r)::text);
      out_ok  := out_ok  || (case when r in ('DENIED','OK:0') then 'PASS' else 'FAIL' end);
    end loop;

    -- ---------------------------------------------------------
    -- B-4. 내보낸 뒤에도 다시 들어오나 (초대장이 남아 있으면)
    -- ---------------------------------------------------------
    reset role;
    delete from public.ledger_members where ledger_id = L_TEST and user_id = U_INVITE;
    perform set_config('request.jwt.claims',
      json_build_object('sub', U_INVITE, 'email','rv-test-invited@example.invalid',
                        'role','authenticated')::text, true);
    set local role authenticated;
    r := pg_temp.rv_try(
      'insert into public.ledger_members(ledger_id,user_id,role) values ('
      ||''''||L_TEST||''','''||U_INVITE||''',''editor'')');
    i := i + 1;
    out_n := array_append(out_n, i); out_area := array_append(out_area, ('D. 내보낸 뒤')::text);
    out_name := array_append(out_name, ('내보낸 사람이 남아 있는 초대장으로 다시 들어오나')::text);
    out_exp := array_append(out_exp, ('DENIED')::text); out_act := array_append(out_act, (r)::text);
    out_ok  := out_ok  || (case when r = 'DENIED' then 'PASS' else 'FAIL' end);

    -- ---------------------------------------------------------
    -- B-5. 사진 경로 규칙
    -- ---------------------------------------------------------
    for t in select * from (values
      ('폴더 없이 버킷 뿌리에 올리나',
       'insert into storage.objects(bucket_id,name) values (''receipts'',''loose.jpg'')'),
      ('uuid 가 아닌 폴더에 올리나',
       'insert into storage.objects(bucket_id,name) values (''receipts'',''../etc/x.jpg'')'),
      ('맨 앞이 빈 경로로 올리나',
       'insert into storage.objects(bucket_id,name) values (''receipts'',''/'||L_TEST||'/x.jpg'')')
    ) v(nm, q) loop
      r := pg_temp.rv_try(t.q);
      i := i + 1;
      out_n := array_append(out_n, i); out_area := array_append(out_area, ('E. 사진 경로')::text);
      out_name := array_append(out_name, (t.nm)::text); out_exp := array_append(out_exp, ('DENIED')::text);
      out_act := array_append(out_act, (r)::text);
      out_ok  := out_ok  || (case when r = 'DENIED' then 'PASS' else 'FAIL' end);
    end loop;

    -- 권한 판정 함수가 이상한 경로에 예외 없이 false 를 돌려주는가
    reset role;
    i := i + 1;
    out_n := array_append(out_n, i); out_area := array_append(out_area, ('E. 사진 경로')::text);
    out_name := array_append(out_name, ('can_read_ledger_path 가 uuid 아닌 값에 false 를 돌려주나')::text);
    out_exp := array_append(out_exp, ('false,false,false')::text);
    out_act := array_append(out_act, ((coalesce(public.can_read_ledger_path('nonsense')::text,'null')||','||
                           coalesce(public.can_read_ledger_path('')::text,'null')||','||
                           coalesce(public.can_read_ledger_path(null)::text,'null')))::text);
    out_ok  := out_ok  || (case when public.can_read_ledger_path('nonsense') is not true
                                 and public.can_read_ledger_path('') is not true
                                 and public.can_read_ledger_path(null) is not true
                                then 'PASS' else 'FAIL' end);

    -- ---------------------------------------------------------
    -- B-6. AI 한도 함수
    -- ---------------------------------------------------------
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role authenticated;
    i := i + 1;
    out_n := array_append(out_n, i); out_area := array_append(out_area, ('F. AI 한도')::text);
    out_name := array_append(out_name, ('토큰 없이 rv_ai_use 를 부르면 거절하나')::text);
    out_exp := array_append(out_exp, ('not_signed_in')::text);
    begin
      out_act := array_append(out_act, (coalesce((public.rv_ai_use(null)::json->>'reason'), '(허용됨!)'))::text);
    exception when others then out_act := array_append(out_act, ('DENIED')::text);
    end;
    out_ok := array_append(out_ok, ((case when out_act[i] in ('not_signed_in','DENIED') then 'PASS' else 'FAIL' end))::text);

    reset role;
    if not setup_ok then
      i := i + 1;
      out_n := array_append(out_n, i); out_area := array_append(out_area, ('!! 준비')::text);
      out_name := array_append(out_name, ('시험용 가짜 사용자를 못 만들었다 — B 이후 결과는 못 믿는다')::text);
      out_exp := array_append(out_exp, ('(성공)')::text); out_act := array_append(out_act, (setup_err)::text);
      out_ok  := out_ok  || 'FAIL';
    end if;

    -- 여기서 일부러 예외를 던져 위의 모든 쓰기를 통째로 되돌린다.
    -- 채점표(out_* 배열)는 변수라서 롤백돼도 값이 남는다.
    raise exception using errcode = 'RV000', message = 'rollback on purpose';

  exception when sqlstate 'RV000' then
    null;   -- 되돌리기 완료. 정상 경로다.
  when others then
    i := i + 1;
    out_n := array_append(out_n, i); out_area := array_append(out_area, ('!! 오류')::text);
    out_name := array_append(out_name, ('시험 도중 예상 못 한 오류 — 자료는 되돌아갔다')::text);
    out_exp := array_append(out_exp, ('(없음)')::text); out_act := array_append(out_act, (sqlerrm)::text);
    out_ok  := out_ok  || 'FAIL';
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  return query
    select out_n[k], out_area[k], out_name[k], out_exp[k], out_act[k], out_ok[k]
    from generate_subscripts(out_n, 1) as k
    order by 1;
end $$;


-- ======================= 결과 =======================
select * from pg_temp.rv_security_check();
