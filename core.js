// core.js — 화면이 아닌 것들 전부: 유틸 / Supabase 접근 / AI 호출.
// 전역(window)에 RV_UTIL, RV_DB, RV_AI 로 노출한다. import/export 없음.

(function () {
  'use strict';

  var CFG = window.RV_CONFIG || {};
  var LEDGER_KEY = 'rv_ledger_id';

  // =============================================================
  // RV_UTIL — 돈, 날짜, 이미지, 계산
  // =============================================================
  var money = new Intl.NumberFormat(CFG.LOCALE || 'en-US', {
    style: 'currency',
    currency: CFG.CURRENCY || 'USD',
  });

  var RV_UTIL = {
    money: function (n) {
      var v = Number(n);
      return money.format(isFinite(v) ? v : 0);
    },

    // 소수점 두 자리 숫자만. 세무사에게 보내는 표에서는 통화기호 없이 쓴다.
    plain: function (n) {
      var v = Number(n);
      return (isFinite(v) ? v : 0).toFixed(2);
    },

    // '2026-08-25' 형태로. Date 의 toISOString 은 UTC 로 밀려 하루 어긋날 수 있어
    // 로컬 기준으로 직접 만든다.
    today: function () { return RV_UTIL.toDateStr(new Date()); },

    toDateStr: function (d) {
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + m + '-' + day;
    },

    prettyDate: function (s) {
      if (!s) return '';
      var p = s.split('-');
      return Number(p[1]) + '월 ' + Number(p[2]) + '일';
    },

    monthKey: function (s) { return (s || '').slice(0, 7); },

    prettyMonth: function (key) {
      var p = (key || '').split('-');
      return p[0] + '년 ' + Number(p[1]) + '월';
    },

    // 영수증 하나를 "분류별 줄" 목록으로 편다.
    // 분할이 없으면 줄 하나(= 전액), 있으면 분할한 만큼.
    // 리포트·CSV·보고서가 전부 이걸 거친다 — 계산 규칙이 한 군데에만 있게.
    lines: function (r) {
      var pct = (r.business_pct == null ? 100 : r.business_pct) / 100;
      var raw = (Array.isArray(r.splits) && r.splits.length)
        ? r.splits
        : [{ category: r.category, amount: r.total, note: '' }];

      return raw.map(function (s) {
        var cat = window.RV_CAT(s.category);
        var amount = Number(s.amount) || 0;
        return {
          category: cat.key,
          cat: cat,
          amount: amount,
          note: s.note || '',
          // 사업 사용 비율(차량 등) × 카테고리 공제율(식비 50%)
          deductible: amount * pct * (cat.deduct == null ? 1 : cat.deduct),
        };
      });
    },

    deductible: function (r) {
      return RV_UTIL.lines(r).reduce(function (s, l) { return s + l.deductible; }, 0);
    },

    isSplit: function (r) {
      return Array.isArray(r.splits) && r.splits.length > 1;
    },

    // 분할 합계가 총액과 맞는지. 센트 단위 반올림 오차는 봐준다.
    splitRemainder: function (total, splits) {
      var sum = (splits || []).reduce(function (s, x) { return s + (Number(x.amount) || 0); }, 0);
      var diff = (Number(total) || 0) - sum;
      return Math.abs(diff) < 0.005 ? 0 : diff;
    },

    // 연간 집계를 Schedule C 줄번호 순서로 정리한다.
    // 세무사에게 보내는 표와 화면 리포트가 같은 결과를 쓰도록 여기서 한 번만 만든다.
    summarize: function (rows) {
      var by = new Map();
      rows.forEach(function (r) {
        RV_UTIL.lines(r).forEach(function (l) {
          if (!by.has(l.category)) by.set(l.category, { cat: l.cat, gross: 0, deduct: 0, n: 0 });
          var e = by.get(l.category);
          e.gross += l.amount;
          e.deduct += l.deductible;
          e.n += 1;
        });
      });
      var all = Array.from(by.values());
      var byLine = function (a, b) {
        // '20b' 같은 값이 있으므로 숫자 부분을 먼저 비교하고 접미사로 가른다.
        var na = parseInt(a.cat.line, 10), nb = parseInt(b.cat.line, 10);
        if (na !== nb) return na - nb;
        return a.cat.line.localeCompare(b.cat.line);
      };
      return {
        cogs: all.filter(function (e) { return e.cat.group === 'cogs'; }).sort(byLine),
        expense: all.filter(function (e) { return e.cat.group === 'expense'; }).sort(byLine),
        byAmount: all.slice().sort(function (a, b) { return b.deduct - a.deduct; }),
      };
    },

    sum: function (items) {
      return items.reduce(function (s, e) { return s + e.deduct; }, 0);
    },

    // 사진을 그대로 올리면 한 장에 3~5MB라 무료 저장소 1GB가 금방 찬다.
    // 긴 변 1600px, JPEG 품질 0.72면 영수증 글자는 멀쩡하면서 200KB 안팎이 된다.
    compressImage: function (file, maxSide, quality) {
      maxSide = maxSide || 1600;
      quality = quality || 0.72;
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          var canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
          URL.revokeObjectURL(url);
          canvas.toBlob(function (blob) {
            if (!blob) return reject(new Error('이미지 변환에 실패했어요.'));
            resolve(blob);
          }, 'image/jpeg', quality);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('이미지를 읽을 수 없어요.'));
        };
        img.src = url;
      });
    },

    blobToDataUrl: function (blob) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(new Error('이미지를 읽을 수 없어요.')); };
        fr.readAsDataURL(blob);
      });
    },

    csvCell: function (v) {
      var s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    },

    // 이메일에서 화면에 쓸 짧은 이름을 만든다 (jenny3d@gmail.com → jenny3d)
    shortName: function (email) {
      return (email || '').split('@')[0] || '알 수 없음';
    },
  };

  // =============================================================
  // RV_DB — Supabase
  // =============================================================
  var client = null;

  function supa() {
    if (client) return client;
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) return null;
    client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return client;
  }

  function need() {
    var c = supa();
    if (!c) throw new Error('Supabase 설정이 아직 안 됐어요.');
    return c;
  }

  var RV_DB = {
    configured: function () {
      return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
    },

    client: supa,

    // ---- 인증: 이메일 매직링크 (비밀번호 없음) ----
    getSession: async function () {
      var c = supa(); if (!c) return null;
      var res = await c.auth.getSession();
      return res.data ? res.data.session : null;
    },

    onAuthChange: function (cb) {
      var c = supa(); if (!c) return function () {};
      var sub = c.auth.onAuthStateChange(function (_e, session) { cb(session); });
      return function () { sub.data.subscription.unsubscribe(); };
    },

    sendMagicLink: async function (email) {
      var c = need();
      var res = await c.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (res.error) throw res.error;
    },

    signOut: async function () {
      var c = supa();
      if (c) await c.auth.signOut();
      try { localStorage.removeItem(LEDGER_KEY); } catch (e) {}
    },

    // ---- 장부 ----

    // 내 이메일 앞으로 온 초대를 전부 받아들인다.
    // 남편이 먼저 로그인해 두었더라도, 초대가 도착한 뒤 다시 열면 여기서 합류된다.
    claimInvites: async function (session) {
      var c = need();
      var email = (session.user.email || '').toLowerCase();

      var inv = await c.from('ledger_invites').select('*').ilike('email', email);
      if (inv.error || !inv.data || !inv.data.length) return 0;

      var mine = await c.from('ledger_members').select('ledger_id').eq('user_id', session.user.id);
      var already = new Set((mine.data || []).map(function (m) { return m.ledger_id; }));

      var joined = 0;
      for (var i = 0; i < inv.data.length; i++) {
        var row = inv.data[i];
        if (!already.has(row.ledger_id)) {
          var ins = await c.from('ledger_members').insert({
            ledger_id: row.ledger_id,
            user_id: session.user.id,
            email: session.user.email,
            role: row.role,
          });
          if (ins.error) continue; // 이미 들어가 있거나 초대가 취소된 경우
          joined++;
        }
        // 초대장은 역할을 이미 옮겨 담았으니 치운다
        await c.from('ledger_invites').delete().eq('id', row.id);
      }
      return joined;
    },

    listLedgers: async function () {
      var c = need();
      // RLS 덕분에 내가 속한 장부만 돌아온다
      var res = await c.from('ledgers').select('*').order('created_at', { ascending: true });
      if (res.error) throw res.error;
      return res.data || [];
    },

    createLedger: async function (session, name) {
      var c = need();
      var made = await c.from('ledgers')
        .insert({ name: name || '우리 공방', owner_id: session.user.id })
        .select().single();
      if (made.error) throw made.error;

      var mem = await c.from('ledger_members').insert({
        ledger_id: made.data.id,
        user_id: session.user.id,
        email: session.user.email,
        role: 'owner',
      });
      if (mem.error) throw mem.error;

      RV_DB.rememberLedger(made.data.id);
      return made.data;
    },

    updateLedger: async function (ledgerId, fields) {
      var c = need();
      var res = await c.from('ledgers').update(fields).eq('id', ledgerId).select().single();
      if (res.error) throw res.error;
      return res.data;
    },

    rememberLedger: function (id) {
      try { localStorage.setItem(LEDGER_KEY, id); } catch (e) {}
    },

    rememberedLedger: function () {
      try { return localStorage.getItem(LEDGER_KEY); } catch (e) { return null; }
    },

    // ---- 식구와 초대 ----
    members: async function (ledgerId) {
      var c = need();
      var res = await c.from('ledger_members').select('*').eq('ledger_id', ledgerId)
                  .order('joined_at', { ascending: true });
      if (res.error) throw res.error;
      return res.data || [];
    },

    pendingInvites: async function (ledgerId) {
      var c = need();
      var res = await c.from('ledger_invites').select('*').eq('ledger_id', ledgerId);
      if (res.error) throw res.error;
      return res.data || [];
    },

    invite: async function (ledgerId, email, role) {
      var c = need();
      // 소문자로 통일해서 넣는다. 대소문자만 다른 초대가 두 개 생기는 걸 막는다.
      var addr = (email || '').trim().toLowerCase();
      if (!addr) throw new Error('이메일 주소를 넣어줘.');

      var res = await c.from('ledger_invites')
        .insert({ ledger_id: ledgerId, email: addr, role: role || 'editor' })
        .select().single();
      if (res.error) {
        if (String(res.error.message || '').indexOf('duplicate') >= 0) {
          throw new Error('이미 초대해 둔 주소예요.');
        }
        throw res.error;
      }
      return res.data;
    },

    cancelInvite: async function (id) {
      var c = need();
      var res = await c.from('ledger_invites').delete().eq('id', id);
      if (res.error) throw res.error;
    },

    removeMember: async function (ledgerId, userId) {
      var c = need();
      var res = await c.from('ledger_members').delete()
                  .eq('ledger_id', ledgerId).eq('user_id', userId);
      if (res.error) throw res.error;
    },

    // ---- 영수증 ----
    list: async function (opts) {
      opts = opts || {};
      var c = supa(); if (!c || !opts.ledgerId) return [];
      var q = c.from('receipts').select('*')
               .eq('ledger_id', opts.ledgerId)
               .order('purchased_at', { ascending: false })
               .order('created_at', { ascending: false });
      if (opts.year) {
        q = q.gte('purchased_at', opts.year + '-01-01')
             .lte('purchased_at', opts.year + '-12-31');
      }
      var res = await q;
      if (res.error) throw res.error;
      return res.data || [];
    },

    save: async function (rec, ledgerId, session) {
      var c = need();
      if (!ledgerId) throw new Error('장부가 선택되지 않았어요.');
      if (!session) throw new Error('로그인이 필요해요.');

      // 분할 정리: 금액 0인 줄은 버리고, 한 줄만 남으면 분할이 아니다.
      var splits = (rec.splits || [])
        .filter(function (s) { return s.category && Number(s.amount) > 0; })
        .map(function (s) {
          return { category: s.category, amount: Number(Number(s.amount).toFixed(2)), note: s.note || '' };
        });
      if (splits.length < 2) splits = null;

      // 목록·필터에서 쓰는 대표 분류는 금액이 가장 큰 줄로 잡는다.
      var mainCategory = rec.category || 'other';
      if (splits) {
        mainCategory = splits.reduce(function (a, b) { return b.amount > a.amount ? b : a; }).category;
      }

      var row = {
        purchased_at: rec.purchased_at,
        merchant: rec.merchant || '',
        category: mainCategory,
        splits: splits,
        total: Number(rec.total) || 0,
        tax: rec.tax === '' || rec.tax == null ? null : Number(rec.tax),
        currency: CFG.CURRENCY || 'USD',
        payment_method: rec.payment_method || null,
        business_pct: rec.business_pct == null ? 100 : Number(rec.business_pct),
        notes: rec.notes || null,
        source: rec.source || 'manual',
        ai_raw: rec.ai_raw || null,
        needs_review: !!rec.needs_review,
      };

      var res;
      if (rec.id) {
        // 입력자(created_by)는 처음 넣은 사람 그대로 둔다. 고친 사람으로 덮어쓰지 않는다.
        res = await c.from('receipts').update(row).eq('id', rec.id).select().single();
      } else {
        row.ledger_id = ledgerId;
        row.created_by = session.user.id;
        res = await c.from('receipts').insert(row).select().single();
      }
      if (res.error) throw res.error;
      return res.data;
    },

    remove: async function (rec) {
      var c = need();
      if (rec.image_path) {
        // 사진이 남아 저장소를 먹지 않도록 먼저 지운다. 실패해도 행 삭제는 진행.
        try { await c.storage.from('receipts').remove([rec.image_path]); } catch (e) {}
      }
      var res = await c.from('receipts').delete().eq('id', rec.id);
      if (res.error) throw res.error;
    },

    // ---- 사진 ----
    uploadImage: async function (ledgerId, receiptId, blob) {
      var c = need();
      // 경로 규칙이 곧 보안 규칙이다. 첫 폴더가 장부 id 라서 식구끼리는 서로 보인다.
      var path = ledgerId + '/' + receiptId + '.jpg';
      var up = await c.storage.from('receipts')
                 .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (up.error) throw up.error;

      var res = await c.from('receipts').update({ image_path: path })
                  .eq('id', receiptId).select().single();
      if (res.error) throw res.error;
      return res.data;
    },

    // 비공개 버킷이라 바로 보는 URL 이 없다. 1시간짜리 서명 URL 을 발급받아 쓴다.
    imageUrl: async function (path) {
      var c = supa(); if (!c || !path) return null;
      var res = await c.storage.from('receipts').createSignedUrl(path, 3600);
      return res.data ? res.data.signedUrl : null;
    },
  };

  // =============================================================
  // RV_AI — 영수증 이미지에서 항목 뽑아내기 (Cloudflare Worker 경유)
  // =============================================================
  var RV_AI = {
    available: function () { return !!CFG.AI_PROXY_URL; },

    extract: async function (blob) {
      if (!CFG.AI_PROXY_URL) throw new Error('AI 인식이 아직 연결되지 않았어요.');

      var dataUrl = await RV_UTIL.blobToDataUrl(blob);
      var base64 = dataUrl.split(',')[1];

      var resp = await fetch(CFG.AI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          media_type: 'image/jpeg',
          categories: window.RV_CATEGORIES.map(function (c) {
            return { key: c.key, label: c.en, hint: c.hint || '' };
          }),
          today: RV_UTIL.today(),
        }),
      });

      if (!resp.ok) {
        var msg = await resp.text().catch(function () { return ''; });
        throw new Error('인식 실패 (' + resp.status + ') ' + msg.slice(0, 200));
      }
      return await resp.json();
    },
  };

  window.RV_UTIL = RV_UTIL;
  window.RV_DB = RV_DB;
  window.RV_AI = RV_AI;
})();
