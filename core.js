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
          if (!by.has(l.category)) {
            by.set(l.category, { cat: l.cat, gross: 0, usd: 0, deduct: 0, n: 0 });
          }
          var e = by.get(l.category);
          e.gross += l.amount;   // 영수증에 찍힌 통화 기준 (섞여 있을 수 있어 화면에 그냥 쓰면 안 된다)
          e.usd += l.usd;        // 달러 환산 — 표와 문서는 전부 이걸 쓴다
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

    // 장부가 실제로 갖고 있는 연도와 가맹점 이름.
    // 연도: 목록의 연도 칸을 데이터로 채우려고 쓴다. 정해진 범위로만 만들면
    //   범위 밖 연도로 저장된 영수증은 화면에서 영영 못 찾는다 — 실제로 그 일이 났다.
    // 가맹점: 같은 가게에서 계속 사니까 매번 손으로 치게 두면 안 된다.
    vocab: async function (ledgerId) {
      var c = supa(); if (!c || !ledgerId) return { years: [], merchants: [] };
      var res = await c.from('receipts')
                  .select('purchased_at, merchant, merchant_en')
                  .eq('ledger_id', ledgerId)
                  .order('purchased_at', { ascending: false });
      if (res.error) return { years: [], merchants: [] };

      var ys = {}, seen = {}, merchants = [];
      (res.data || []).forEach(function (r) {
        var y = (r.purchased_at || '').slice(0, 4);
        if (/^\d{4}$/.test(y)) ys[y] = 1;
        var name = (r.merchant || '').trim();
        if (name && !seen[name]) {
          seen[name] = 1;
          // 최근 것이 먼저 오므로 영문 표기도 가장 최근 것이 남는다
          merchants.push({ name: name, en: (r.merchant_en || '').trim() });
        }
      });
      return {
        years: Object.keys(ys).sort().reverse().map(Number),
        merchants: merchants,
      };
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
      // 사진이 남아 저장소를 먹지 않도록 먼저 지운다. 실패해도 행 삭제는 진행.
      var paths = RV_DB.imagePaths(rec);
      if (paths.length) {
        try { await c.storage.from('receipts').remove(paths); } catch (e) {}
      }
      var res = await c.from('receipts').delete().eq('id', rec.id);
      if (res.error) throw res.error;
    },

    // ---- 사진 ----

    // 한 영수증에 붙은 사진 전부. 대표가 먼저 온다.
    imagePaths: function (rec) {
      if (!rec) return [];
      var out = [];
      if (rec.image_path) out.push(rec.image_path);
      (rec.extra_paths || []).forEach(function (p) { if (p) out.push(p); });
      return out;
    },

    // 사진 목록을 통째로 저장한다.
    // items: 화면에 보이는 순서대로 [{ path } (이미 올라간 것) | { blob } (새 것)].
    // 첫 장이 대표 — AI가 읽고 목록·PDF에 나오는 것도 이 장이다.
    saveImages: async function (ledgerId, receiptId, items, oldPaths) {
      var c = need();
      var paths = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].path) { paths.push(items[i].path); continue; }
        // 경로 규칙이 곧 보안 규칙이다. 첫 폴더가 장부 id 라서 식구끼리는 서로 보인다.
        // 뒤에 붙는 무작위 조각은 지웠다 다시 넣은 사진이 옛 사진을 덮어쓰지 않게 한다.
        var path = ledgerId + '/' + receiptId + '-' +
                   Date.now().toString(36) + i + '.jpg';
        var up = await c.storage.from('receipts')
                   .upload(path, items[i].blob, { contentType: 'image/jpeg', upsert: true });
        if (up.error) throw up.error;
        paths.push(path);
      }

      // 화면에서 뺀 사진은 저장소에서도 치운다. 실패해도 표 갱신은 진행한다 —
      // 표가 진짜다. 저장소에 남은 파일은 아무도 못 보는 쓰레기일 뿐이다.
      var gone = (oldPaths || []).filter(function (p) { return paths.indexOf(p) < 0; });
      if (gone.length) { try { await c.storage.from('receipts').remove(gone); } catch (e) {} }

      var res = await c.from('receipts')
                  .update({ image_path: paths[0] || null, extra_paths: paths.slice(1) })
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
    // 마지막 인식 시도가 어디서 어떻게 끝났는지 남긴다.
    //
    // 태블릿·폰에는 개발자 도구가 없어서 "아무 일도 안 일어나"를 눈으로 볼 방법이 없다.
    // 그래서 단계마다 기록해 두고 설정 → 연결 상태에서 읽는다.
    trace: function (stage, extra) {
      var t = Object.assign({ at: new Date().toISOString(), stage: stage }, extra || {});
      RV_AI.last = t;
      try { localStorage.setItem('rv_ai_last', JSON.stringify(t)); } catch (e) {}
      return t;
    },

    lastTrace: function () {
      if (RV_AI.last) return RV_AI.last;
      try { return JSON.parse(localStorage.getItem('rv_ai_last') || 'null'); }
      catch (e) { return null; }
    },

    extract: async function (blob, ledgerId, ledger) {
      RV_AI.trace('시작', { size: blob && blob.size });
      if (!CFG.AI_PROXY_URL) {
        RV_AI.trace('주소 없음');
        throw new Error('AI 인식이 아직 연결되지 않았어요.');
      }
      // 파일이 섞여 올라간 경우를 여기서 잡는다 — 예전 app.jsx + 새 categories.js 처럼.
      if (typeof window.RV_KIND !== 'function' || typeof window.RV_CATS !== 'function') {
        RV_AI.trace('파일 불일치');
        throw new Error('앱 파일 버전이 섞였어. 설정에서 ⟳(강제 갱신)을 눌러줘.');
      }

      var session = await window.RV_DB.getSession();
      if (!session) {
        RV_AI.trace('로그인 없음');
        throw new Error('로그인이 필요해요.');
      }

      var dataUrl = await RV_UTIL.blobToDataUrl(blob);
      var base64 = dataUrl.split(',')[1];
      RV_AI.trace('보내는 중', { kb: Math.round(base64.length / 1024) });

      // 응답이 영영 안 오는 경우를 막는다. 그냥 두면 "읽는 중..." 에서 멈춘 채 끝난다.
      var ctl = null, timer = null;
      try {
        ctl = new AbortController();
        timer = setTimeout(function () { ctl.abort(); }, 70000);
      } catch (e) {}

      var resp;
      try {
        resp = await fetch(CFG.AI_PROXY_URL, {
        signal: ctl ? ctl.signal : undefined,
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
      } catch (netEx) {
        RV_AI.trace('연결 실패', { error: String(netEx && netEx.message || netEx) });
        throw new Error(
          (netEx && netEx.name === 'AbortError')
            ? '인식이 70초를 넘겨서 멈췄어. 사진을 다시 찍거나 항목을 직접 넣어줘.'
            : '인식 서버에 연결하지 못했어 (' + (netEx && netEx.message) + ')'
        );
      } finally {
        if (timer) clearTimeout(timer);
      }

      var body = await resp.json().catch(function () { return null; });
      RV_AI.trace('응답 받음', { status: resp.status, ok: resp.ok });

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
        RV_AI.trace('서버 오류', { status: resp.status, detail: msg.slice(0, 150) });
        throw new Error('인식 실패 (' + resp.status + ') ' + msg.slice(0, 200));
      }
      if (!body || typeof body !== 'object') {
        RV_AI.trace('응답 이상', { body: String(body).slice(0, 100) });
        throw new Error('인식 결과를 읽지 못했어. 다시 시도해줘.');
      }
      RV_AI.trace('성공', {
        merchant: body.merchant || '(없음)',
        amount: body.amount == null ? '(없음)' : body.amount,
      });
      return body;
    },
  };

  // =============================================================
  // RV_APP — 앱 자체에 대한 것 (버전 확인, 강제 갱신, 진단)
  // =============================================================
  var RV_APP = {
    // 이 앱을 이루는 파일들. 강제 갱신이 이걸 하나씩 새로 받아
    // 브라우저 캐시를 갈아끼운다. 파일을 추가하면 여기에도 넣을 것.
    FILES: ['index.html', 'config.js', 'labels.js', 'categories.js',
            'core.js', 'app.jsx', 'sw.js', 'manifest.webmanifest'],

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

      // 여기가 핵심이다.
      // 서비스워커와 캐시 스토리지를 지워도 **브라우저 자체 HTTP 캐시**는 그대로 남는다.
      // GitHub Pages 는 파일을 10분간 캐시하라고 내려보내므로, 그 사이에는
      // 새로고침을 해도 옛날 app.jsx 가 그대로 나온다. 실제로 이 일이 있었다.
      // 주소에 ?fresh= 를 붙이는 건 HTML 한 장만 새로 받게 할 뿐, 스크립트에는 소용없다.
      //
      // cache:'reload' 로 한 번씩 받아오면 브라우저 캐시의 그 항목이 새 것으로 갈린다.
      // 그다음 새로고침하면 방금 갱신된 것을 쓴다.
      try {
        await Promise.all(RV_APP.FILES.map(function (f) {
          return fetch(f, { cache: 'reload' }).catch(function () {});
        }));
      } catch (e) {}

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

      // 파일이 섞여 올라갔는지. 하나라도 없으면 예전 파일이 남아 있는 것이다.
      var missing = [];
      ['RV_KIND', 'RV_CATS', 'RV_PROFILES', 'RV_T'].forEach(function (k) {
        if (!window[k]) missing.push(k);
      });
      out.push({
        k: 'Files match',
        v: missing.length ? '섞였어 — ⟳ 눌러줘 (' + missing.join(', ') + ')' : '정상',
        bad: missing.length > 0,
      });

      // 마지막 자동 인식이 어디까지 갔는지. "아무 일도 안 일어나"를 여기서 읽는다.
      var t = window.RV_AI && window.RV_AI.lastTrace && window.RV_AI.lastTrace();
      out.push({
        k: 'Last AI read',
        v: t ? (String(t.at).slice(5, 16).replace('T', ' ') + ' · ' + t.stage +
                (t.status ? ' (' + t.status + ')' : '') +
                (t.error ? ' — ' + String(t.error).slice(0, 60) : '') +
                (t.detail ? ' — ' + String(t.detail).slice(0, 60) : '') +
                (t.merchant ? ' — ' + t.merchant : ''))
              : '아직 없음',
        bad: !!(t && (t.error || t.detail || /실패|없음|이상|불일치/.test(t.stage))),
      });
      return out;
    },
  };

  // =============================================================
  // RV_ZIP — 백업 파일을 만드는 최소한의 zip
  //
  // 라이브러리를 안 쓰는 이유: 사진은 이미 JPEG(압축된 것)이라 다시 압축해봐야
  // 크기가 안 줄고 시간만 든다. 그래서 "저장만"(store) 방식으로 담는다.
  // 그러면 zip 규격 중 우리가 쓸 부분이 헤더 세 종류뿐이라 직접 쓰는 게 낫다 —
  // 남의 CDN 이 죽어도 백업 기능은 살아 있어야 한다.
  // =============================================================
  var RV_ZIP = (function () {
    var TABLE = (function () {
      var t = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
      }
      return t;
    })();

    function crc32(buf) {
      var c = 0xFFFFFFFF;
      for (var i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    }

    // zip 은 1980년식 DOS 날짜를 쓴다. 2초 단위이고 1980년 이전은 못 담는다.
    function dosTime(d) {
      return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    }
    function dosDate(d) {
      var y = Math.max(1980, d.getFullYear());
      return (((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    }

    function utf8(s) { return new TextEncoder().encode(s); }

    // files: [{ name: '경로/이름', data: Uint8Array, date?: Date }]
    function make(files, when) {
      when = when || new Date();
      var parts = [];      // 최종 Blob 조각들
      var central = [];    // 중앙 목록
      var offset = 0;

      files.forEach(function (f) {
        var name = utf8(f.name);
        var data = f.data;
        var crc = crc32(data);
        var d = f.date || when;

        var head = new DataView(new ArrayBuffer(30));
        head.setUint32(0, 0x04034b50, true);   // 로컬 헤더 표시
        head.setUint16(4, 20, true);           // 필요한 버전
        head.setUint16(6, 0x0800, true);       // 파일 이름은 UTF-8 (한글 이름을 위해)
        head.setUint16(8, 0, true);            // 저장만 (압축 안 함)
        head.setUint16(10, dosTime(d), true);
        head.setUint16(12, dosDate(d), true);
        head.setUint32(14, crc, true);
        head.setUint32(18, data.length, true);
        head.setUint32(22, data.length, true);
        head.setUint16(26, name.length, true);
        head.setUint16(28, 0, true);

        parts.push(new Uint8Array(head.buffer), name, data);

        var cen = new DataView(new ArrayBuffer(46));
        cen.setUint32(0, 0x02014b50, true);
        cen.setUint16(4, 20, true);            // 만든 버전
        cen.setUint16(6, 20, true);            // 필요한 버전
        cen.setUint16(8, 0x0800, true);
        cen.setUint16(10, 0, true);
        cen.setUint16(12, dosTime(d), true);
        cen.setUint16(14, dosDate(d), true);
        cen.setUint32(16, crc, true);
        cen.setUint32(20, data.length, true);
        cen.setUint32(24, data.length, true);
        cen.setUint16(28, name.length, true);
        cen.setUint32(42, offset, true);       // 이 파일의 로컬 헤더 위치
        central.push(new Uint8Array(cen.buffer), name);

        offset += 30 + name.length + data.length;
      });

      var cdSize = central.reduce(function (n, p) { return n + p.length; }, 0);
      var end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, files.length, true);
      end.setUint16(10, files.length, true);
      end.setUint32(12, cdSize, true);
      end.setUint32(16, offset, true);

      return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]),
                      { type: 'application/zip' });
    }

    return { make: make, crc32: crc32 };
  })();

  // =============================================================
  // RV_BACKUP — 앱이 없어져도 남는 사본
  //
  // 무료 Supabase 에는 자동 백업이 없고, 사진(Storage)은 유료 요금제의 백업에도
  // 안 들어간다. 그러니 백업은 사용자가 손에 쥐는 파일이어야 한다.
  //
  // 그래서 zip 안에는 "앱이 있어야 읽히는 것"을 하나도 안 넣는다:
  //   photos/  — 날짜·가맹점 이름이 붙은 JPEG. 탐색기에서 그냥 보인다.
  //   receipts.csv — 엑셀에서 열린다. 세무사에게 그대로 넘겨도 된다.
  //   receipts.json — 나중에 앱으로 되돌릴 때 쓰는 원본 그대로의 값.
  //   README.txt — 5년 뒤에 이 폴더를 열 사람에게 하는 설명.
  // =============================================================
  var RV_BACKUP = (function () {

    // 파일 이름에 못 쓰는 글자만 걷어낸다. 한글은 그대로 둔다 — 알아볼 수 있어야 한다.
    function safeName(s) {
      return String(s || '').replace(/[\/\\:*?"<>|\x00-\x1f]/g, ' ')
                            .replace(/\s+/g, ' ').trim().slice(0, 40);
    }

    function csvOf(rows, ledger) {
      var head = [
        'receipt_id', 'ledger', 'date', 'merchant', 'merchant_en', 'country',
        'currency', 'amount_original', 'fx_rate', 'fx_rate_date', 'fx_source',
        'amount_usd', 'sales_tax', 'category_key', 'category_en', 'form_line',
        'business_pct', 'deductible_usd', 'payment_method', 'payment_ref',
        'purpose', 'purpose_en', 'splits_json', 'photo_files', 'entered_at',
      ];
      var P = window.RV_KIND(ledger.kind);
      var out = [head.join(',')];
      rows.forEach(function (r) {
        var cat = window.RV_CAT(r.category);
        out.push([
          r.id, ledger.name, r.purchased_at, r.merchant, r.merchant_en, r.country,
          r.currency, r.amount_original, r.fx_rate, r.fx_rate_date, r.fx_source,
          r.total, r.tax, r.category, cat.en, (P.lineLabel && cat.line ? P.lineLabel + ' ' + cat.line : ''),
          r.business_pct, RV_UTIL.deductible(r).toFixed(2), r.payment_method, r.payment_ref,
          r.notes, r.notes_en,
          (r.splits && r.splits.length) ? JSON.stringify(r.splits) : '',
          (r._files || []).join('; '),
          r.created_at,
        ].map(RV_UTIL.csvCell).join(','));
      });
      // 엑셀이 한글을 깨뜨리지 않도록 BOM 을 붙인다
      return '﻿' + out.join('\n');
    }

    function readme(ledger, rows, when, missing) {
      var L = [];
      L.push('ReceiptVault 백업 — ' + ledger.name);
      L.push('만든 날: ' + when.toISOString().slice(0, 16).replace('T', ' '));
      L.push('영수증 ' + rows.length + '건');
      L.push('');
      L.push('■ 이 폴더에 뭐가 있나');
      L.push('  photos/       영수증 사진 원본. 파일 이름이 "날짜 가맹점" 이라 앱 없이도 찾을 수 있어.');
      L.push('                한 거래에 종이가 여러 장이면 뒤에 -1, -2 가 붙어. -1 이 정산에 쓴 장이야.');
      L.push('  receipts.csv  전체 표. 엑셀·구글시트에서 바로 열려. 세무사에게 이것만 줘도 돼.');
      L.push('  receipts.json 앱에 되돌릴 때 쓰는 원본 값. 사람이 읽을 건 아니야.');
      L.push('');
      L.push('■ 왜 필요한가');
      L.push('  영수증 원본(종이)을 버려도 이 사진이 증빙이 돼. 그러니 이 폴더가 사라지면');
      L.push('  증빙도 같이 사라져. 앱 서버 하나에만 두지 말고 여기 파일을 따로 보관해.');
      L.push('  클라우드(구글 드라이브 등) 한 곳 + 다른 한 곳, 이렇게 두 군데면 충분해.');
      L.push('');
      L.push('■ 얼마나 오래 두나');
      L.push('  사업 경비: 신고한 해로부터 최소 3년 (미국 국세청 기본 기준).');
      L.push('  집 공사비(cost basis): 그 집을 판 뒤 3년까지. 사실상 집을 갖고 있는 내내야.');
      L.push('');
      if (missing && missing.length) {
        L.push('■ 주의 — 못 받은 사진 ' + missing.length + '장');
        L.push('  아래 영수증의 사진을 내려받지 못했어. 인터넷이 끊겼거나 파일이 지워진 경우야.');
        L.push('  앱에서 다시 백업을 받아 이 목록이 비는지 확인해줘.');
        missing.forEach(function (m) { L.push('  - ' + m); });
        L.push('');
      }
      L.push('만든 앱: ReceiptVault (https://jennyryu3d.github.io/receiptvault/)');
      return L.join('\n');
    }

    // rows 를 받아 zip Blob 을 만든다.
    // onStep(done, total, label) 로 진행 상황을 알린다 — 폰에서는 몇십 초 걸린다.
    async function build(ledger, rows, onStep) {
      var when = new Date();
      var files = [];
      var missing = [];
      var bytes = 0;
      var LIMIT = 1200 * 1024 * 1024;   // 폰 메모리가 감당할 만한 선

      // 사진마다 이름이 겹치지 않게 세어 둔다 (같은 날 같은 가게가 둘일 수 있다)
      var used = {};
      var jobs = [];
      rows.forEach(function (r) {
        var paths = RV_DB.imagePaths(r);
        r._files = [];
        if (!paths.length) return;
        // 이름은 영수증마다 하나. 같은 거래의 사진들은 뒤의 -1, -2 로만 갈린다.
        // (겹침 번호를 사진마다 매기면 한 거래가 여러 거래처럼 보인다.)
        var base = (r.purchased_at || '날짜없음') + ' ' + safeName(r.merchant || '가맹점없음');
        var n = (used[base] = (used[base] || 0) + 1);
        var stem = base + (n > 1 ? ' (' + n + ')' : '');
        paths.forEach(function (p, i) {
          var name = 'photos/' + stem + (paths.length > 1 ? '-' + (i + 1) : '') + '.jpg';
          r._files.push(name.slice(7));
          jobs.push({ path: p, name: name, label: r.merchant || r.purchased_at });
        });
      });

      for (var i = 0; i < jobs.length; i++) {
        var j = jobs[i];
        if (onStep) onStep(i, jobs.length, j.label);
        try {
          var url = await RV_DB.imageUrl(j.path);
          if (!url) throw new Error('링크를 못 받았어');
          var res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          var buf = new Uint8Array(await res.arrayBuffer());
          bytes += buf.length;
          if (bytes > LIMIT) {
            throw new Error('BACKUP_TOO_BIG');
          }
          files.push({ name: j.name, data: buf, date: when });
        } catch (ex) {
          if (ex && ex.message === 'BACKUP_TOO_BIG') throw ex;
          // 한 장이 실패했다고 백업 전체를 버리면 아무것도 안 남는다.
          // 대신 뭐가 빠졌는지 README 에 적어 둔다.
          missing.push(j.name.slice(7) + '  (' + (ex && ex.message || ex) + ')');
        }
      }
      if (onStep) onStep(jobs.length, jobs.length, '파일 묶는 중');

      var enc = new TextEncoder();
      files.push({ name: 'README.txt', data: enc.encode(readme(ledger, rows, when, missing)), date: when });
      files.push({ name: 'receipts.csv', data: enc.encode(csvOf(rows, ledger)), date: when });
      files.push({
        name: 'receipts.json',
        data: enc.encode(JSON.stringify({
          app: 'ReceiptVault', made_at: when.toISOString(),
          ledger: { id: ledger.id, name: ledger.name, kind: ledger.kind, cat_set: ledger.cat_set },
          receipts: rows,
        }, null, 2)),
        date: when,
      });

      return { blob: RV_ZIP.make(files, when), missing: missing, photos: jobs.length - missing.length };
    }

    return { build: build, csvOf: csvOf, safeName: safeName };
  })();

  window.RV_APP = RV_APP;
  window.RV_UTIL = RV_UTIL;
  window.RV_DB = RV_DB;
  window.RV_AI = RV_AI;
  window.RV_ZIP = RV_ZIP;
  window.RV_BACKUP = RV_BACKUP;
})();
