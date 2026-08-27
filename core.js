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

    // 사람이 친 금액을 숫자로 바꾼다.
    // '12,345' '$12.34' '₩12,000' '12 345' 전부 받아준다 —
    // 영수증을 보고 옮겨 적을 때 통화기호나 쉼표가 딸려오는 건 너무 당연한 일이라,
    // 그걸 거부하고 아무 말 없이 멈추는 쪽이 잘못이다.
    parseAmount: function (v) {
      if (v == null || v === '') return NaN;
      if (typeof v === 'number') return v;
      var cleaned = String(v)
        .replace(/[^\d.,-]/g, '')   // 통화기호·공백·글자 제거
        .replace(/,/g, '');         // 천 단위 쉼표 제거
      if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN;
      var n = Number(cleaned);
      return isFinite(n) ? n : NaN;
    },

    prettyMonth: function (key) {
      var p = (key || '').split('-');
      return p[0] + '년 ' + Number(p[1]) + '월';
    },

    // 통화 표기. 영수증에 찍힌 통화 그대로 보여줄 때 쓴다.
    inCurrency: function (n, cur) {
      var v = Number(n);
      if (!isFinite(v)) v = 0;
      try {
        return new Intl.NumberFormat(CFG.LOCALE || 'en-US', {
          style: 'currency', currency: cur || 'USD',
          // 원·엔은 소수점이 없다. Intl 이 알아서 처리한다.
        }).format(v);
      } catch (e) {
        return v.toFixed(2) + ' ' + (cur || '');
      }
    },

    // 영수증 하나를 "분류별 줄" 목록으로 편다.
    // 분할이 없으면 줄 하나(= 전액), 있으면 분할한 만큼.
    // 리포트·CSV·보고서가 전부 이걸 거친다 — 계산 규칙이 한 군데에만 있게.
    //
    // 분할 금액은 "영수증에 찍힌 통화" 로 넣는다. 영수증을 보고 옮겨 적는 거니까
    // 그게 자연스럽다. USD 환산은 여기서 환율을 곱해 만든다.
    lines: function (r) {
      var pct = (r.business_pct == null ? 100 : r.business_pct) / 100;
      var rate = Number(r.fx_rate);
      if (!isFinite(rate) || rate <= 0) rate = 1;

      var base = r.amount_original != null ? r.amount_original : r.total;
      var raw = (Array.isArray(r.splits) && r.splits.length)
        ? r.splits
        : [{ category: r.category, amount: base, note: '' }];

      return raw.map(function (s) {
        var cat = window.RV_CAT(s.category);
        var amount = RV_UTIL.parseAmount(s.amount) || 0;  // 영수증 통화
        var usd = amount * rate;
        return {
          category: cat.key,
          cat: cat,
          amount: amount,        // 영수증에 찍힌 통화 기준
          usd: usd,              // 달러 환산
          currency: r.currency || 'USD',
          note: s.note || '',
          // 사업 사용 비율(차량 등) × 카테고리 공제율(식비 50%)
          deductible: usd * pct * (cat.deduct == null ? 1 : cat.deduct),
        };
      });
    },

    // 거래일의 공시 환율을 받아온다 (유럽중앙은행 자료, 무료·키 불필요).
    // 주말·공휴일이면 그 직전 영업일 환율이 돌아온다.
    fetchRate: async function (currency, dateStr) {
      if (!currency || currency === 'USD') {
        return { rate: 1, date: dateStr, source: 'same' };
      }
      var url = 'https://api.frankfurter.dev/v1/' + encodeURIComponent(dateStr) +
                '?base=' + encodeURIComponent(currency) + '&symbols=USD';
      var res = await fetch(url);
      if (!res.ok) throw new Error('환율을 가져오지 못했어요 (' + res.status + ')');
      var data = await res.json();
      var rate = data && data.rates && data.rates.USD;
      if (!rate) throw new Error('그 날짜의 ' + currency + ' 환율 자료가 없어요.');
      return { rate: rate, date: data.date || dateStr, source: 'ecb' };
    },

    // 결제 수단 표기 정리. 'Visa ...4821' 정도만 남긴다.
    //
    // AI에게 끝 4자리만 달라고 시켜두긴 했지만, 모델이 실수로 전체 번호를 뱉을 수도 있다.
    // 카드번호가 통째로 데이터베이스에 들어가는 건 어떤 이유로도 안 되니까
    // 저장되기 전에 여기서 한 번 더 자른다. 5자리 이상 이어진 숫자는 끝 4자리만 남긴다.
    cleanPaymentRef: function (v) {
      if (!v) return '';
      var s = String(v).replace(/[•*·]+/g, '.').trim();
      s = s.replace(/\d[\d\s-]{4,}/g, function (run) {
        var digits = run.replace(/\D/g, '');
        return '...' + digits.slice(-4);
      });
      return s.replace(/\s+/g, ' ').slice(0, 40);
    },

    deductible: function (r) {
      return RV_UTIL.lines(r).reduce(function (s, l) { return s + l.deductible; }, 0);
    },

    // 영수증 통화 기준 총액 (분할 검사와 화면 표시에 쓴다)
    originalTotal: function (r) {
      var v = RV_UTIL.parseAmount(r.amount_original != null ? r.amount_original : r.total);
      return isFinite(v) ? v : 0;
    },

    isForeign: function (r) {
      return !!(r.currency && r.currency !== 'USD');
    },

    isSplit: function (r) {
      return Array.isArray(r.splits) && r.splits.length > 1;
    },

    // 분할 합계가 총액과 맞는지. 센트 단위 반올림 오차는 봐준다.
    splitRemainder: function (total, splits) {
      var sum = (splits || []).reduce(function (s, x) {
        return s + (RV_UTIL.parseAmount(x.amount) || 0);
      }, 0);
      var diff = (RV_UTIL.parseAmount(total) || 0) - sum;
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
      var byOrd = function (a, b) { return (a.cat.ord || 0) - (b.cat.ord || 0); };

      // group 이름을 미리 정해두지 않는다. 분류표가 쓰는 group 이 곧 칸 이름이다.
      // 새 장부 종류가 새 group 을 쓰더라도 여기는 고칠 필요가 없다.
      var groups = {};
      all.forEach(function (e) {
        var g = e.cat.group || 'other';
        (groups[g] = groups[g] || []).push(e);
      });
      Object.keys(groups).forEach(function (g) {
        // 신고서 줄번호가 있는 표는 줄번호 순, 없으면 정해둔 순서대로
        groups[g].sort(groups[g][0].cat.line ? byLine : byOrd);
      });

      return {
        group: function (name) { return groups[name] || []; },
        groups: groups,
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

    createLedger: async function (session, name, kind, catSet) {
      var c = need();
      // 종류와 분류표가 실제로 있는 값인지 여기서 한 번 거른다.
      // 없는 값이면 기본값으로 떨어지게 — 화면이 통째로 못 그려지는 것보다 낫다.
      var prof = window.RV_KIND(kind);
      var set = prof.catSets.indexOf(catSet) >= 0 ? catSet : prof.catSets[0];
      var made = await c.from('ledgers')
        .insert({
          name: name || prof.defaultName,
          kind: prof.key,
          cat_set: set,
          owner_id: session.user.id,
        })
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
        .filter(function (s) { return s.category && RV_UTIL.parseAmount(s.amount) > 0; })
        .map(function (s) {
          return {
            category: s.category,
            amount: Number(RV_UTIL.parseAmount(s.amount).toFixed(2)),
            note: s.note || '',
          };
        });
      if (splits.length < 2) splits = null;

      // 목록·필터에서 쓰는 대표 분류는 금액이 가장 큰 줄로 잡는다.
      var mainCategory = rec.category || 'other';
      if (splits) {
        mainCategory = splits.reduce(function (a, b) { return b.amount > a.amount ? b : a; }).category;
      }

      var taxAmount = RV_UTIL.parseAmount(rec.tax);

      // 통화 두 벌:
      //   amount_original + currency = 영수증에 찍힌 그대로
      //   total                      = 미국 신고에 쓰는 USD (환율을 곱한 값)
      var currency = rec.currency || 'USD';
      var original = RV_UTIL.parseAmount(rec.amount_original) || 0;
      var rate = RV_UTIL.parseAmount(rec.fx_rate);
      if (!isFinite(rate) || rate <= 0) rate = 1;
      var usdTotal = currency === 'USD' ? original : Number((original * rate).toFixed(2));

      var row = {
        purchased_at: rec.purchased_at,
        merchant: rec.merchant || '',
        // 세무사에게 나가는 영문 표기. 비어 있으면 원래 이름을 그대로 쓴다.
        merchant_en: (rec.merchant_en || '').trim() || null,
        notes_en: (rec.notes_en || '').trim() || null,
        country: rec.country || 'US',
        category: mainCategory,
        splits: splits,
        amount_original: original,
        currency: currency,
        fx_rate: rate,
        fx_rate_date: rec.fx_rate_date || rec.purchased_at,
        fx_source: currency === 'USD' ? 'same' : (rec.fx_source || 'ecb'),
        total: usdTotal,
        tax: isFinite(taxAmount) ? taxAmount : null,
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

    // 오늘 AI 인식을 몇 장 썼는지 (설정 화면에 보여준다)
    aiQuota: async function () {
      var c = supa(); if (!c) return null;
      var res = await c.rpc('rv_ai_quota');
      return res.error ? null : res.data;
    },
  };

  // =============================================================
  // RV_AI — 영수증 이미지에서 항목 뽑아내기 (Cloudflare Worker 경유)
  // =============================================================
  var RV_AI = {
    available: function () { return !!CFG.AI_PROXY_URL; },

    // 로그인한 사람만 인식을 부를 수 있다. 토큰을 같이 보내면 Worker 가
    // 그 토큰으로 사용량 한도를 확인하고 기록한다. 주소만 알아낸 외부인은
    // 토큰이 없어서 아무것도 못 한다 — API 요금이 새지 않게 하는 핵심 장치다.
    extract: async function (blob, ledgerId, ledger) {
      if (!CFG.AI_PROXY_URL) throw new Error('AI 인식이 아직 연결되지 않았어요.');

      var session = await window.RV_DB.getSession();
      if (!session) throw new Error('로그인이 필요해요.');

      var dataUrl = await RV_UTIL.blobToDataUrl(blob);
      var base64 = dataUrl.split(',')[1];

      var resp = await fetch(CFG.AI_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          image: base64,
          media_type: 'image/jpeg',
          ledger_id: ledgerId || null,
          // 장부에 따라 분류표도, 워커가 쓰는 설명문도 달라진다.
          // 워커에는 프로필이 정해둔 값(ai)만 넘어간다 — 임의 문장을 넘기지 않는다.
          kind: window.RV_KIND(ledger && ledger.kind).ai,
          categories: window.RV_CATS(ledger).map(function (c) {
            return { key: c.key, label: c.en, hint: c.hint || '' };
          }),
          countries: (window.RV_COUNTRIES || []).map(function (c) {
            return c.code + '=' + c.en;
          }).join(', '),
          today: RV_UTIL.today(),
        }),
      });

      var body = await resp.json().catch(function () { return null; });

      if (!resp.ok) {
        // 한도 초과는 "오류" 라기보다 알려줘야 할 상태라 문구를 따로 만든다.
        if (body && body.error === 'quota') {
          if (body.reason === 'user_limit') {
            throw new Error('오늘 AI 인식 한도(' + body.limit + '장)를 다 썼어. ' +
                            '내일 다시 열려. 지금은 항목을 직접 채워도 저장은 돼.');
          }
          if (body.reason === 'global_limit') {
            throw new Error('오늘 전체 인식 한도를 다 썼어. 내일 다시 열려.');
          }
        }
        var msg = body ? JSON.stringify(body) : '';
        throw new Error('인식 실패 (' + resp.status + ') ' + msg.slice(0, 200));
      }
      return body;
    },
  };

  // =============================================================
  // RV_APP — 앱 자체에 대한 것 (버전 확인, 강제 갱신, 진단)
  // =============================================================
  var RV_APP = {
    version: function () {
      return (CFG.APP_VERSION || '0.0.0');
    },

    copyright: function () {
      return '© ' + (CFG.COPYRIGHT_YEAR || new Date().getFullYear()) +
             ' ' + (CFG.DEVELOPER || '');
    },

    isDev: function () { return (CFG.STAGE || 'dev') === 'dev'; },

    // 지금 브라우저가 들고 있는 app.jsx 가 언제 서버에 올라간 것인지.
    // 버전 번호를 손으로 올리는 걸 잊어도 이 값은 자동으로 바뀌므로,
    // "내가 방금 올린 파일이 실제로 반영됐나" 를 이걸로 확인한다.
    lastDeployed: async function () {
      try {
        var res = await fetch('app.jsx?probe=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
        var lm = res.headers.get('Last-Modified');
        if (!lm) return null;
        var d = new Date(lm);
        return isNaN(d.getTime()) ? null : d;
      } catch (e) {
        return null;
      }
    },

    // 캐시와 서비스워커를 통째로 비우고 새로 받는다.
    // 태블릿에는 개발자 도구가 없어서 "고쳤는데 안 바뀐다" 를 풀 방법이 마땅치 않다.
    // 이 버튼이 그 역할을 한다.
    // 강제 갱신. 누른 화면으로 되돌아오게 tab 을 주소에 실어 보낸다 —
    // 설정에서 눌렀는데 영수증 목록으로 떨어지면 "뭐가 된 거지" 하게 된다.
    hardRefresh: async function (tab) {
      try {
        if ('serviceWorker' in navigator) {
          var regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(function (r) { return r.unregister(); }));
        }
      } catch (e) {}
      try {
        if (window.caches) {
          var keys = await caches.keys();
          await Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }
      } catch (e) {}
      // 주소에 시각을 붙여 브라우저 캐시까지 확실히 우회한다
      var q = '?fresh=' + Date.now() + (tab ? '&tab=' + encodeURIComponent(tab) : '');
      window.location.replace(window.location.pathname + q);
    },

    // 무엇이 연결돼 있고 무엇이 안 됐는지. 문제가 생겼을 때 여기부터 본다.
    diagnostics: async function (session) {
      var out = [];
      out.push({ k: 'App URL', v: window.location.origin + window.location.pathname });
      out.push({ k: 'Version', v: 'v' + RV_APP.version() + ' · ' + (CFG.STAGE || 'dev') });
      out.push({ k: 'Signed in', v: session ? session.user.email : '아니오' });
      out.push({
        k: 'Database',
        v: CFG.SUPABASE_URL ? CFG.SUPABASE_URL.replace('https://', '') : '미설정',
        bad: !CFG.SUPABASE_URL,
      });
      out.push({
        k: 'AI proxy',
        v: CFG.AI_PROXY_URL ? '연결됨' : '미설정',
        bad: !CFG.AI_PROXY_URL,
      });
      var d = await RV_APP.lastDeployed();
      out.push({
        k: 'Files updated',
        v: d ? d.toLocaleString() : '확인 불가',
      });
      return out;
    },
  };

  window.RV_APP = RV_APP;
  window.RV_UTIL = RV_UTIL;
  window.RV_DB = RV_DB;
  window.RV_AI = RV_AI;
})();
