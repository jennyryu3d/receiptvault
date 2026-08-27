// app.jsx — 화면 전부. <script type="text/babel"> 로 로드된다.
// React 는 CDN 에서 온 전역이므로 import 하지 않고 그대로 쓴다.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const U = window.RV_UTIL;
const DB = window.RV_DB;
const AI = window.RV_AI;

// =================================================================
// 작은 조각들
// =================================================================

function Spinner({ label }) {
  return (
    <div className="rv-spinner">
      <div className="rv-spinner-dot" />
      <span>{label || '불러오는 중...'}</span>
    </div>
  );
}

function Banner({ kind, children, onClose }) {
  if (!children) return null;
  return (
    <div className={'rv-banner rv-banner-' + (kind || 'info')}>
      <div>{children}</div>
      {onClose && <button className="rv-banner-x" onClick={onClose}>✕</button>}
    </div>
  );
}

// 한글이 섞여 있는지. 세무사용 영문 표기가 필요한지 판단하는 데만 쓴다.
function hasKorean(s) {
  return /[ㄱ-ㆎ가-힣]/.test(s || '');
}

// 항목 이름표. 영문이 크고 한글이 작게 붙는다.
// 양쪽 나라에서 그대로 쓰는 말(Email, PDF ...)은 labels.js 에 ko 가 없어서 영문만 나온다.
function L({ k, suffix }) {
  const t = window.RV_T[k] || { en: k };
  return (
    <span className="rv-l">
      <b>{t.en}{suffix || ''}</b>
      {t.ko && <i>{t.ko}</i>}
    </span>
  );
}

// 나라 표시 (US / 미국)
function CountryTag({ code }) {
  const c = window.RV_COUNTRY(code);
  return <span className="rv-country" title={c.en}>{c.code}</span>;
}

function CategoryPill({ catKey }) {
  const c = window.RV_CAT(catKey);
  return (
    <span className={'rv-pill rv-pill-' + c.group}
          title={c.en + (c.line ? ' · line ' + c.line : '')}>
      {c.ko}
    </span>
  );
}

// 분류 선택 드롭다운. 원가/경비를 optgroup 으로 갈라 놓는다.
// 분류 목록도 그 묶음 이름도 장부가 정한다. 여기서는 종류를 하나도 모른다.
function CategorySelect({ value, onChange, ledger }) {
  const cats = window.RV_CATS(ledger);
  const sections = window.RV_KIND(ledger.kind).report.sections;
  return (
    <select className="rv-input" value={value} onChange={(e) => onChange(e.target.value)}>
      {sections.map((sec) => {
        const items = cats.filter((c) => c.group === sec.group);
        if (!items.length) return null;
        return (
          <optgroup key={sec.group} label={sec.pick || sec.title}>
            {items.map((c) => <option key={c.key} value={c.key}>{c.ko}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

// =================================================================
// 로그인 (비밀번호 없음 — 이메일로 링크가 온다)
// =================================================================

function SignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await DB.sendMagicLink(email.trim());
      setSent(true);
    } catch (ex) {
      setErr(ex.message || '메일을 보내지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rv-center">
      <div className="rv-card rv-signin">
        <div className="rv-logo">ReceiptVault</div>
        <p className="rv-muted">가죽공방 경비 · Schedule C 정리</p>

        {sent ? (
          <>
            <p className="rv-ok">메일함을 확인해줘.<br />{email} 으로 로그인 링크를 보냈어.</p>
            <p className="rv-muted rv-small">
              링크는 이 기기의 브라우저에서 열어야 로그인이 이어져.
              안 오면 스팸함도 확인해봐.
            </p>
            <button className="rv-btn-ghost" onClick={() => setSent(false)}>다시 보내기</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <input
              className="rv-input" type="email" required placeholder="이메일 주소"
              value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" inputMode="email"
            />
            <button className="rv-btn" disabled={busy || !email}>
              {busy ? '보내는 중...' : '로그인 링크 받기'}
            </button>
            {err && <Banner kind="error">{err}</Banner>}
          </form>
        )}
      </div>
    </div>
  );
}

// =================================================================
// 장부 막대 — 앱 맨 위에 늘 보인다
// =================================================================
//
// 왜 설정 안이 아니라 여기인가:
//   지금 어느 장부에 넣고 있는지가 안 보이면 공방 영수증을 리모델링 장부에
//   넣어버린다. 그건 나중에 세무사 자료가 틀리는 사고다.
//   그리고 장부를 오가는 건 설정이 아니라 일상 동작이다.

function LedgerBar({ ledger, ledgers, stamp, onOpen }) {
  const K = window.RV_KIND(ledger.kind);
  return (
    <button className="rv-ledgerbar" onClick={onOpen}>
      <span className="rv-ledgerbar-icon">{K.icon}</span>
      <span className="rv-ledgerbar-mid">
        <span className="rv-ledgerbar-name">{ledger.name}</span>
        <span className="rv-ledgerbar-kind">{K.en} · {K.ko}</span>
      </span>
      <span className="rv-ledgerbar-right">
        <span className="rv-ledgerbar-swap">
          {ledgers.length > 1 ? '장부 바꾸기 ▾' : '장부 ▾'}
        </span>
        {/* 개발 중에는 버전과 파일 시각을 늘 보이게 — 갱신됐는지 여기서 바로 안다 */}
        {stamp && <span className="rv-ledgerbar-ver">{stamp}</span>}
      </span>
    </button>
  );
}

// 장부 고르기. 아래에서 올라오는 판.
function LedgerSheet({ ledger, ledgers, onPick, onNew, onClose }) {
  // 세금 성격으로 묶어서 보여준다 — 전체 앱 지도가 한눈에 보이게
  const groups = [];
  ledgers.forEach((l) => {
    const sc = window.RV_KIND(l.kind).taxScope;
    const g = groups.find((x) => x.scope === sc);
    if (g) g.items.push(l); else groups.push({ scope: sc, items: [l] });
  });

  return (
    <div className="rv-sheet-back" onClick={onClose}>
      <div className="rv-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rv-sheet-grip" />
        <div className="rv-sheet-title"><L k="ledger" /></div>

        {groups.map((g) => (
          <div key={g.scope} className="rv-sheet-group">
            <div className="rv-scope">{window.RV_TAX_SCOPES[g.scope].ko}</div>
            {g.items.map((l) => {
              const K = window.RV_KIND(l.kind);
              const on = l.id === ledger.id;
              return (
                <button key={l.id}
                        className={'rv-sheet-item' + (on ? ' rv-sheet-on' : '')}
                        style={{ borderColor: on ? K.accent : undefined }}
                        onClick={() => { onPick(l.id); onClose(); }}>
                  <span className="rv-sheet-icon" style={{ color: K.accent }}>{K.icon}</span>
                  <span className="rv-sheet-name">
                    {l.name}
                    <span className="rv-sheet-kind">{K.en} · {K.ko}</span>
                  </span>
                  {on && <span className="rv-sheet-check">✓</span>}
                </button>
              );
            })}
          </div>
        ))}

        <button className="rv-btn-ghost rv-wide" onClick={() => { onClose(); onNew(); }}>
          + 새 장부 만들기
        </button>
        <p className="rv-muted rv-small">
          장부끼리는 자료도 보고서도 섞이지 않아. 같이 쓰는 사람도 장부마다 따로야.
        </p>
        <button className="rv-btn-ghost rv-wide" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

// =================================================================
// 장부가 아직 없을 때
// =================================================================

// 첫 장부를 만들 때도, 나중에 장부를 하나 더 만들 때도 같은 화면을 쓴다.
// onCancel 이 있으면 "하나 더 만드는 중"이라 뒤로 갈 수 있다.
function StartLedger({ session, onMade, onCancel }) {
  const [kind, setKind] = useState('business');
  const [catSet, setCatSet] = useState(null);
  const [name, setName] = useState(window.RV_KIND('business').defaultName);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // 고를 수 있는 종류는 프로필 표에서 그대로 온다.
  // 나중에 종류가 늘어나면 이 화면은 손댈 필요가 없다.
  const kinds = Object.keys(window.RV_PROFILES);
  const sets = window.RV_CAT_SET_LIST(kind);
  const chosenSet = catSet && sets.some((x) => x.key === catSet) ? catSet : sets[0].key;

  // 종류를 고르면 이름을 그럴듯하게 바꿔준다. 직접 고친 뒤에는 건드리지 않는다.
  function pickKind(k) {
    setKind(k);
    setCatSet(null);
    if (!touched) setName(window.RV_KIND(k).defaultName);
  }

  async function make() {
    setBusy(true); setErr('');
    try {
      const l = await DB.createLedger(session, name.trim() || '새 장부', kind, chosenSet);
      onMade(l);
    } catch (ex) {
      setErr(ex.message || '장부를 만들지 못했어요.');
      setBusy(false);
    }
  }

  // 세금 성격이 같은 것끼리 묶어서 보여준다 (신고에 들어가는 것 / 나중 것 / 무관한 것)
  const byScope = [];
  kinds.forEach((k) => {
    const sc = window.RV_KIND(k).taxScope;
    const found = byScope.find((g) => g.scope === sc);
    if (found) found.keys.push(k);
    else byScope.push({ scope: sc, keys: [k] });
  });

  return (
    <div className="rv-center">
      <div className="rv-card">
        <div className="rv-logo">장부 만들기</div>
        <p className="rv-muted rv-small">
          영수증이 쌓이는 곳이야. 성격이 다른 지출은 장부를 따로 만들면 돼 —
          장부끼리는 자료도 보고서도 섞이지 않아.
        </p>

        {byScope.map((g) => (
          <div key={g.scope} className="rv-kinds">
            <div className="rv-scope">{window.RV_TAX_SCOPES[g.scope].ko}</div>
            {g.keys.map((k) => {
              const K = window.RV_KIND(k);
              return (
                <button key={k}
                        className={'rv-kind' + (kind === k ? ' rv-kind-on' : '')}
                        onClick={() => pickKind(k)}>
                  <div className="rv-kind-t">{K.en} <span className="rv-kind-ko">{K.ko}</span></div>
                  <div className="rv-muted rv-small">{K.desc}</div>
                </button>
              );
            })}
          </div>
        ))}

        {/* 같은 종류 안에서 업종이 여럿이면 분류표를 고른다.
            하나뿐이면 물어볼 게 없으니 아예 안 보여준다. */}
        {sets.length > 1 && (
          <label className="rv-label">분류표 (업종)
            <select className="rv-input" value={chosenSet}
                    onChange={(e) => setCatSet(e.target.value)}>
              {sets.map((x) => (
                <option key={x.key} value={x.key}>{x.ko} · {x.en}</option>
              ))}
            </select>
          </label>
        )}

        <label className="rv-label">장부 이름
          <input className="rv-input" value={name}
                 onChange={(e) => { setTouched(true); setName(e.target.value); }} />
        </label>

        <p className="rv-muted rv-small">
          종류와 분류표는 만든 뒤에 바꿀 수 없어. 이미 넣은 영수증이 그 분류를 가리키게 되거든.
        </p>

        <button className="rv-btn" onClick={make} disabled={busy}>
          {busy ? '만드는 중...' : '만들기'}
        </button>
        {onCancel && (
          <button className="rv-btn-ghost rv-wide" onClick={onCancel} disabled={busy}>
            취소
          </button>
        )}
        {err && <Banner kind="error">{err}</Banner>}
      </div>
    </div>
  );
}

// =================================================================
// 영수증 입력 / 수정
// =================================================================

const BLANK = {
  purchased_at: U.today(),
  merchant: '',
  merchant_en: '',
  country: 'US',
  currency: 'USD',
  amount_original: '',
  fx_rate: 1,
  fx_rate_date: '',
  fx_source: 'same',
  category: 'cogs_material',
  tax: '',
  payment_method: 'card',
  payment_ref: '',
  business_pct: 100,
  notes: '',
  notes_en: '',
  source: 'manual',
  splits: [],
};

function ReceiptForm({ initial, ledger, paymentRefs, session, onDone, onCancel }) {
  const ledgerId = ledger.id;
  const P = window.RV_KIND(ledger.kind);      // 장부 종류가 화면을 정한다
  const F = P.form;
  const [rec, setRec] = useState(() => Object.assign(
    {}, BLANK,
    // 장부마다 분류표가 다르니 처음 골라져 있는 값도 달라야 한다
    { category: window.RV_FIRST_CAT(ledger.kind, ledger.cat_set) },
    initial || {}
  ));
  const [blob, setBlob] = useState(null);        // 새로 고른 이미지
  const [preview, setPreview] = useState(null);  // 화면에 보여줄 URL
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const editing = !!(initial && initial.id);

  useEffect(() => {
    let alive = true;
    if (initial && initial.image_path) {
      DB.imageUrl(initial.image_path).then((u) => { if (alive) setPreview(u); });
    }
    return () => { alive = false; };
  }, [initial && initial.image_path]);

  function set(k, v) { setRec((r) => Object.assign({}, r, { [k]: v })); }

  // ---- 통화와 환율 ----
  const foreign = rec.currency && rec.currency !== 'USD';
  const [fxBusy, setFxBusy] = useState(false);
  const [fxErr, setFxErr] = useState('');

  // 통화나 거래일이 바뀌면 그 날짜의 공시 환율을 가져온다.
  // 카드 청구액으로 직접 고쳐 넣은 경우(fx_source==='manual')는 건드리지 않는다 —
  // 실제로 청구된 금액이 공시 환율보다 정확하니까 사람이 넣은 값을 이긴다고 보면 안 된다.
  useEffect(() => {
    let alive = true;
    if (!foreign) {
      setFxErr('');
      setRec((r) => (r.fx_rate === 1 && r.fx_source === 'same') ? r
        : Object.assign({}, r, { fx_rate: 1, fx_source: 'same', fx_rate_date: r.purchased_at }));
      return;
    }
    if (rec.fx_source === 'manual') return;
    if (!rec.purchased_at) return;

    setFxBusy(true); setFxErr('');
    U.fetchRate(rec.currency, rec.purchased_at).then(
      (got) => {
        if (!alive) return;
        setFxBusy(false);
        setRec((r) => Object.assign({}, r, {
          fx_rate: got.rate, fx_rate_date: got.date, fx_source: 'ecb',
        }));
      },
      (ex) => {
        if (!alive) return;
        setFxBusy(false);
        setFxErr(ex.message || '환율을 가져오지 못했어요. 달러 금액을 직접 넣어줘.');
      }
    );
    return () => { alive = false; };
  }, [rec.currency, rec.purchased_at, rec.fx_source]);

  const originalAmount = U.parseAmount(rec.amount_original) || 0;
  const usdAmount = foreign
    ? originalAmount * (Number(rec.fx_rate) || 0)
    : originalAmount;

  // 카드에 실제로 청구된 달러 금액을 직접 넣으면, 그 값에서 환율을 거꾸로 계산한다.
  function setUsdManually(v) {
    const usd = U.parseAmount(v);
    if (!isFinite(usd) || originalAmount <= 0) return;
    setRec((r) => Object.assign({}, r, {
      fx_rate: usd / originalAmount,
      fx_source: 'manual',
      fx_rate_date: r.purchased_at,
    }));
  }

  function resetFx() {
    setRec((r) => Object.assign({}, r, { fx_source: 'ecb' }));
  }

  // 나라를 고르면 그 나라 통화를 기본으로 맞춰준다 (직접 바꿀 수 있음)
  function setCountry(code) {
    const c = window.RV_COUNTRY(code);
    setRec((r) => Object.assign({}, r, {
      country: code,
      currency: r.currency === 'USD' || r.currency === window.RV_COUNTRY(r.country).currency
        ? c.currency : r.currency,
      fx_source: 'ecb',
    }));
  }

  // ---- 분할 ----
  // 분할 금액은 영수증에 찍힌 통화 기준이다. 영수증을 보고 옮겨 적으니까.
  const splits = rec.splits || [];
  const splitting = splits.length > 0;
  const remainder = U.splitRemainder(rec.amount_original, splits);

  function startSplit() {
    setRec((r) => Object.assign({}, r, {
      splits: [
        { category: r.category, amount: r.amount_original || '', note: '' },
        { category: 'supplies', amount: '', note: '' },
      ],
    }));
  }

  function setSplit(i, k, v) {
    setRec((r) => {
      const next = r.splits.slice();
      next[i] = Object.assign({}, next[i], { [k]: v });
      return Object.assign({}, r, { splits: next });
    });
  }

  function addSplit() {
    setRec((r) => Object.assign({}, r, {
      splits: r.splits.concat([{ category: 'supplies', amount: '', note: '' }]),
    }));
  }

  function removeSplit(i) {
    setRec((r) => {
      const next = r.splits.filter((_, j) => j !== i);
      if (next.length < 2) {
        return Object.assign({}, r, {
          splits: [],
          category: next.length ? next[0].category : r.category,
        });
      }
      return Object.assign({}, r, { splits: next });
    });
  }

  function fillRemainder(i) {
    const cur = Number(splits[i].amount) || 0;
    setSplit(i, 'amount', (cur + remainder).toFixed(2));
  }

  async function pickImage(e, source) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setErr(''); setBusy('이미지 정리하는 중...');
    try {
      const small = await U.compressImage(file);
      setBlob(small);
      setPreview(URL.createObjectURL(small));
      set('source', source);

      if (AI.available()) {
        setBusy('영수증 읽는 중...');
        const got = await AI.extract(small, ledgerId, ledger);

        // AI가 제안한 분할은 그대로 믿지 않는다.
        // 분류 key 가 실제로 있고, 합계가 총액과 맞을 때만 받아들인다.
        let aiSplits = [];
        if (Array.isArray(got.splits) && got.splits.length > 1 && got.total != null) {
          const clean = got.splits.filter((s) => s && window.RV_CAT_BY_KEY[s.category] && Number(s.amount) > 0);
          if (clean.length > 1 && U.splitRemainder(got.total, clean) === 0) {
            aiSplits = clean.map((s) => ({
              category: s.category,
              amount: String(Number(s.amount).toFixed(2)),
              note: s.note || '',
            }));
          }
        }

        const cur = (window.RV_CURRENCIES || []).includes(got.currency) ? got.currency : null;
        const ctry = window.RV_COUNTRIES.some((c) => c.code === got.country) ? got.country : null;

        setRec((r) => Object.assign({}, r, {
          splits: aiSplits,
          purchased_at: got.purchased_at || r.purchased_at,
          merchant: got.merchant || r.merchant,
          merchant_en: got.merchant_en || r.merchant_en || '',
          notes_en: got.notes_en || r.notes_en || '',
          notes: r.notes || got.notes_en || '',
          country: ctry || r.country,
          currency: cur || r.currency,
          // 통화가 바뀌었으니 환율은 다시 받아오게 표시해 둔다
          fx_source: cur && cur !== 'USD' ? 'ecb' : 'same',
          amount_original: got.amount != null ? String(got.amount) : r.amount_original,
          tax: got.tax != null ? String(got.tax) : r.tax,
          payment_method: got.payment_method || r.payment_method,
          // 어느 카드였는지. 명세서와 대조할 때 쓰는 값이라 자동으로 채우고,
          // 틀리면 손으로 고칠 수 있게 그냥 글자로 둔다.
          payment_ref: U.cleanPaymentRef(got.payment_ref) || r.payment_ref || '',
          category: got.category && window.RV_CAT_BY_KEY[got.category] ? got.category : r.category,
          ai_raw: got,
          needs_review: true,
          source: source,
        }));
      }
    } catch (ex) {
      setErr((ex.message || '이미지 처리에 실패했어요.') + ' 항목은 직접 채워도 저장돼.');
    } finally {
      setBusy('');
    }
  }

  async function save() {
    if (!rec.purchased_at) return setErr('거래일을 넣어줘.');

    if (!isFinite(originalAmount) || originalAmount <= 0) {
      return setErr('금액을 넣어줘. 숫자만 있으면 돼.');
    }
    if (foreign && !(Number(rec.fx_rate) > 0)) {
      return setErr('환율을 못 가져왔어. 달러 금액을 직접 넣어주면 저장돼.');
    }

    if (splitting && remainder !== 0) {
      const cur = rec.currency || 'USD';
      return setErr(
        '분할한 금액의 합이 총액과 안 맞아. ' +
        (remainder > 0 ? U.inCurrency(remainder, cur) + ' 남았어.'
                       : U.inCurrency(-remainder, cur) + ' 초과했어.')
      );
    }

    setBusy('저장하는 중...'); setErr('');
    try {
      const saved = await DB.save(Object.assign({}, rec, { needs_review: false }), ledgerId, session);

      if (blob) {
        setBusy('사진 올리는 중...');
        try {
          await DB.uploadImage(ledgerId, saved.id, blob);
        } catch (imgEx) {
          // 영수증 자체는 이미 저장됐다. 사진만 실패한 걸로 전체를 되돌리면
          // 방금 입력한 내용을 다시 치게 만드는 셈이라 더 나쁘다.
          setBusy('');
          setErr('영수증은 저장됐는데 사진만 못 올렸어: ' +
                 (imgEx.message || '알 수 없는 오류') +
                 ' — 목록에서 그 영수증을 열어 사진만 다시 넣으면 돼.');
          return;
        }
      }
      onDone();
    } catch (ex) {
      setErr(ex.message || '저장하지 못했어요.');
      setBusy('');
    }
  }

  const cat = window.RV_CAT(rec.category);
  // 분할 중이고 합계가 맞을 때만 분할 기준으로 계산한다. 안 맞는 중간 상태에서
  // 엉뚱한 숫자를 보여주면 오히려 헷갈린다.
  const calcBase = {
    amount_original: originalAmount,
    total: usdAmount,
    currency: rec.currency,
    fx_rate: Number(rec.fx_rate) || 1,
    category: rec.category,
    business_pct: rec.business_pct,
    splits: splitting && remainder === 0 ? splits : null,
  };
  const dedu = U.deductible(calcBase);
  const halfOnly = U.lines(calcBase).some((l) => l.cat.deduct < 1);

  return (
    <div className="rv-screen">
      <div className="rv-topbar">
        <button className="rv-btn-ghost" onClick={onCancel}><L k="cancel" /></button>
        <strong><L k={editing ? 'editReceipt' : 'addReceipt'} /></strong>
        <button className="rv-btn-sm" onClick={save} disabled={!!busy}><L k="save" /></button>
      </div>

      {/* 어느 장부에 저장되는지. 장부를 잘못 고른 채 한참 입력하는 걸 막는다. */}
      <div className="rv-inledger">
        <span className="rv-inledger-icon">{P.icon}</span>
        {/* flex 안에서는 글자 조각마다 간격이 벌어진다. 한 덩어리로 묶어둔다 */}
        <span><strong>{ledger.name}</strong>에 저장돼 · {P.ko}</span>
      </div>

      {/* 화면 아래에 붙는 알림.
          예전에는 폼 맨 위에 띄웠는데, 저장 버튼은 맨 아래에 있어서
          메시지가 화면 밖에 있었다. 눌러도 아무 일 없는 것처럼 보이는 원인이었다. */}
      {(busy || err) && (
        <div className={'rv-fixed-note ' + (err ? 'rv-fixed-err' : 'rv-fixed-busy')}>
          <div>{err || busy}</div>
          {err && <button className="rv-banner-x" onClick={() => setErr('')}>✕</button>}
        </div>
      )}

      <div className="rv-body">
        {rec.needs_review && (
          <Banner kind="warn">
            AI가 채운 값이야. 금액과 날짜만 눈으로 확인하고 저장해줘.
          </Banner>
        )}

        <div className="rv-photo-row">
          <button className="rv-btn-ghost rv-grow" onClick={() => cameraRef.current.click()}>
            📷 <L k="takePhoto" />
          </button>
          <button className="rv-btn-ghost rv-grow" onClick={() => fileRef.current.click()}>
            🖼 <L k="fromGallery" />
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment"
               hidden onChange={(e) => pickImage(e, 'photo')} />
        <input ref={fileRef} type="file" accept="image/*"
               hidden onChange={(e) => pickImage(e, 'screenshot')} />

        {!AI.available() && (
          <p className="rv-muted rv-small">
            자동 인식은 아직 연결 전이야. 사진은 증빙으로 저장되고, 항목은 아래에 직접 넣으면 돼.
          </p>
        )}

        {preview && (
          <div className="rv-preview">
            <img src={preview} alt="영수증" />
          </div>
        )}

        <label className="rv-label"><L k="date" />
          <input className="rv-input" type="date" value={rec.purchased_at}
                 onChange={(e) => set('purchased_at', e.target.value)} />
        </label>
        <p className="rv-muted rv-small">영수증에 찍힌 거래일이야. 목록도 이 날짜순으로 정렬돼.</p>

        <div className="rv-row">
          <label className="rv-label rv-grow"><L k="merchant" />
            <input className="rv-input" type="text" placeholder="Tandy Leather"
                   value={rec.merchant} onChange={(e) => set('merchant', e.target.value)} />
          </label>
          <label className="rv-label rv-country-sel"><L k="country" />
            <select className="rv-input" value={rec.country || 'US'}
                    onChange={(e) => setCountry(e.target.value)}>
              {window.RV_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} · {c.ko}</option>
              ))}
            </select>
          </label>
        </div>

        {/* ---- 금액: 영수증 통화 + 달러 환산 ---- */}
        <div className="rv-row">
          <label className="rv-label rv-cur-sel"><L k="currency" />
            <select className="rv-input" value={rec.currency || 'USD'}
                    onChange={(e) => setRec((r) => Object.assign({}, r,
                      { currency: e.target.value, fx_source: 'ecb' }))}>
              {window.RV_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="rv-label rv-grow"><L k="amount" />
            <input className="rv-input" type="number" inputMode="decimal" step="0.01"
                   placeholder="0.00" value={rec.amount_original}
                   onChange={(e) => set('amount_original', e.target.value)} />
          </label>
        </div>
        <p className="rv-muted rv-small">영수증에 찍힌 금액 그대로. 팁·세금·배송비까지 포함한 최종 결제액.</p>

        {foreign && (
          <div className="rv-fx">
            <div className="rv-fx-head">
              <span><L k="amountUsd" /></span>
              <strong>{U.money(usdAmount)}</strong>
            </div>

            {fxBusy && <p className="rv-muted rv-small">환율 가져오는 중...</p>}
            {fxErr && <p className="rv-warn-text rv-small">{fxErr}</p>}

            {!fxBusy && !fxErr && (
              <p className="rv-muted rv-small">
                {rec.fx_source === 'manual'
                  ? '카드 청구액으로 직접 넣은 값이야. '
                  : '유럽중앙은행 공시 환율 (' + (rec.fx_rate_date || rec.purchased_at) + ') · '}
                1 {rec.currency} = {Number(rec.fx_rate).toFixed(6)} USD
              </p>
            )}

            <label className="rv-label">
              카드에 실제로 청구된 달러 금액 (알면 이게 더 정확해)
              <input className="rv-input" type="number" inputMode="decimal" step="0.01"
                     placeholder={usdAmount ? usdAmount.toFixed(2) : '0.00'}
                     onChange={(e) => setUsdManually(e.target.value)} />
            </label>
            {rec.fx_source === 'manual' && (
              <button className="rv-btn-ghost rv-wide-sm" onClick={resetFx}>
                공시 환율로 되돌리기
              </button>
            )}
            <p className="rv-muted rv-small">
              카드사 환율에는 수수료가 섞여 있어서 공시 환율과 조금 달라.
              명세서에 찍힌 달러 금액을 넣으면 세무사가 대조할 때 딱 맞아떨어져.
            </p>
          </div>
        )}

        <label className="rv-label"><L k="salesTax" suffix=" (optional)" />
          <input className="rv-input" type="number" inputMode="decimal" step="0.01"
                 placeholder="0.00" value={rec.tax || ''}
                 onChange={(e) => set('tax', e.target.value)} />
        </label>

        {!splitting ? (
          <>
            <label className="rv-label"><L k="category" />
              <CategorySelect value={rec.category} ledger={ledger} onChange={(v) => set('category', v)} />
            </label>
            <p className="rv-muted rv-small">
              Schedule C {cat.line}번 · {cat.en}
              {cat.hint ? ' — ' + cat.hint : ''}
            </p>
            <button className="rv-btn-ghost rv-split-start" onClick={startSplit}>
              ⑂ <L k="split" />
            </button>
            <p className="rv-muted rv-small">
              가죽이랑 공구를 한 번에 산 영수증처럼, 한 장을 여러 분류로 쪼갤 때.
            </p>
          </>
        ) : (
          <div className="rv-splits">
            <div className="rv-splits-head">
              <span><L k="split" /></span>
              <span className={remainder === 0 ? 'rv-ok rv-small' : 'rv-warn-text rv-small'}>
                {remainder === 0
                  ? '총액과 일치'
                  : remainder > 0
                    ? U.inCurrency(remainder, rec.currency) + ' 남음'
                    : U.inCurrency(-remainder, rec.currency) + ' 초과'}
              </span>
            </div>

            {splits.map((s, i) => {
              const sc = window.RV_CAT(s.category);
              return (
                <div key={i} className="rv-split-row">
                  <div className="rv-split-top">
                    <CategorySelect value={s.category} ledger={ledger} onChange={(v) => setSplit(i, 'category', v)} />
                    <button className="rv-split-x" onClick={() => removeSplit(i)} title="이 줄 지우기">✕</button>
                  </div>
                  <div className="rv-split-bottom">
                    <input className="rv-input" type="number" inputMode="decimal" step="0.01"
                           placeholder="0.00" value={s.amount}
                           onChange={(e) => setSplit(i, 'amount', e.target.value)} />
                    {remainder !== 0 && (
                      <button className="rv-btn-ghost rv-split-fill" onClick={() => fillRemainder(i)}>
                        <L k="fillRest" />
                      </button>
                    )}
                  </div>
                  <p className="rv-muted rv-small">
                    Schedule C {sc.line}번 · {sc.en}
                    {foreign && U.parseAmount(s.amount) > 0 &&
                      ' · ' + U.money(U.parseAmount(s.amount) * (Number(rec.fx_rate) || 0))}
                  </p>
                </div>
              );
            })}

            <button className="rv-btn-ghost rv-wide-sm" onClick={addSplit}>+ <L k="addLine" /></button>
            <p className="rv-muted rv-small">
              합계가 총액 {U.inCurrency(originalAmount, rec.currency)} 과 맞아야 저장돼.
              금액은 <strong>영수증에 찍힌 통화</strong> 그대로 넣어 — 달러 환산은 자동으로 돼.
              줄을 하나만 남기고 지우면 분할이 자동으로 풀려.
            </p>
          </div>
        )}

        <div className="rv-row">
          <label className="rv-label rv-grow"><L k="payment" />
            <select className="rv-input" value={rec.payment_method || 'card'}
                    onChange={(e) => set('payment_method', e.target.value)}>
              <option value="card">Card · 카드</option>
              <option value="cash">Cash · 현금</option>
              <option value="transfer">Transfer · 계좌이체</option>
              <option value="other">Other · 기타</option>
            </select>
          </label>
          {/* 사업 사용 비율은 그 개념이 있는 장부에만 뜬다.
              리모델링이나 개인 기록에는 "몇 % 사업용" 이라는 게 없다. */}
          {F.businessPct && (
            <label className="rv-label rv-grow"><L k="businessUse" />
              <input className="rv-input" type="number" min="0" max="100" step="5"
                     value={rec.business_pct}
                     onChange={(e) => set('business_pct', e.target.value)} />
            </label>
          )}
          {/* 어느 카드로 냈는지. 예전에 쓴 표기가 아래 목록으로 뜬다. */}
          <label className="rv-label rv-grow"><L k="paymentRef" />
            <input className="rv-input" list="rv-payrefs" placeholder="Visa ...4821"
                   value={rec.payment_ref || ''}
                   onChange={(e) => set('payment_ref', e.target.value)} />
            <datalist id="rv-payrefs">
              {(paymentRefs || []).map((p) => <option key={p} value={p} />)}
            </datalist>
          </label>
        </div>
        {F.businessPct && Number(rec.business_pct) < 100 && (
          <p className="rv-muted rv-small">
            개인 겸용 지출이라 {rec.business_pct}%만 사업 경비로 잡혀.
          </p>
        )}
        <p className="rv-muted rv-small">
          카드 표기는 영수증에서 자동으로 채워지고, 틀리면 고치면 돼. 나중에 카드 명세서와
          한 줄씩 맞출 때 이게 있어야 편해. 카드번호 전체는 저장되지 않아 — 끝 4자리까지만이야.
        </p>

        {/* 사업 장부에서는 IRS가 요구하는 기록 항목이고, 부동산 장부에서는
            개량인지 수리인지를 가르는 근거다. 라벨과 설명은 장부가 정한다. */}
        <label className="rv-label"><L k={F.purposeLabel} />
          <textarea className="rv-input" rows="2" spellCheck="true"
                    placeholder={F.purposePlaceholder}
                    value={rec.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </label>
        <p className="rv-muted rv-small">{F.purposeHelp}</p>
        {cat.key === 'meals' && (
          <Banner kind="warn">
            식비는 기록 요건이 하나 더 있어 — <strong>누구와 함께했고 무슨 논의를 했는지</strong>를
            위 칸에 같이 적어줘. (예: "Tandy 담당자와 가죽 단가 협의")
          </Banner>
        )}

        {/* 세무사에게 나가는 자료는 영문이어야 한다.
            가맹점이나 메모가 한글이면 여기에 영문 표기를 남겨둔다. */}
        {(hasKorean(rec.merchant) || hasKorean(rec.notes) || rec.merchant_en || rec.notes_en) && (
          <div className="rv-en-box">
            <div className="rv-en-head">세무사용 영문 표기</div>
            <p className="rv-muted rv-small">
              한글이 섞여 있어. 세무사에게 보내는 PDF와 CSV에는 아래 영문이 대신 나가.
              비워두면 원래 글자가 그대로 나가서 못 읽어.
            </p>
            {hasKorean(rec.merchant) && (
              <label className="rv-label">가맹점 (영문)
                <input className="rv-input" placeholder="예: Hankook Market"
                       value={rec.merchant_en || ''}
                       onChange={(e) => set('merchant_en', e.target.value)} />
              </label>
            )}
            {hasKorean(rec.notes) && (
              <label className="rv-label">메모 (영문)
                <input className="rv-input" placeholder="예: thread and dye"
                       value={rec.notes_en || ''}
                       onChange={(e) => set('notes_en', e.target.value)} />
              </label>
            )}
          </div>
        )}

        {originalAmount > 0 && (
          <div className="rv-deduct">
            <span className="rv-deduct-k">{P.counted.en}</span>{' '}
            <span className="rv-deduct-ko">{P.counted.ko}</span>{' '}
            <strong>{U.money(dedu)}</strong>
            {halfOnly && dedu > 0 && <span className="rv-muted"> (식비는 50%만 인정)</span>}
            {dedu === 0 && (
              <span className="rv-muted"> (이 분류는 합계에 안 들어가 — 기록만 남아)</span>
            )}
          </div>
        )}

        <button className="rv-btn rv-wide" onClick={save} disabled={!!busy}>
          {busy || <L k="save" />}
        </button>
      </div>
    </div>
  );
}

// =================================================================
// 목록
// =================================================================

function ReceiptList({ rows, loading, onOpen, onAdd, year, years, onYear, canWrite }) {
  const groups = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => {
      const k = U.monthKey(r.purchased_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return Array.from(m.entries());
  }, [rows]);

  const yearTotal = rows.reduce((s, r) => s + U.deductible(r), 0);

  return (
    <div className="rv-screen">
      <div className="rv-topbar">
        <select className="rv-year" value={year} onChange={(e) => onYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        <strong>{U.money(yearTotal)}</strong>
        {canWrite
          ? <button className="rv-btn-sm" onClick={onAdd}>+ 추가</button>
          : <span className="rv-muted rv-small">보기 전용</span>}
      </div>

      <div className="rv-body">
        {loading && <Spinner />}
        {!loading && rows.length === 0 && (
          <div className="rv-empty">
            <p>{year}년 영수증이 아직 없어.</p>
            {canWrite && <button className="rv-btn" onClick={onAdd}>첫 영수증 넣기</button>}
          </div>
        )}

        {groups.map(([mk, items]) => {
          const sum = items.reduce((s, r) => s + U.deductible(r), 0);
          return (
            <div key={mk} className="rv-month">
              <div className="rv-month-head">
                <span>{U.prettyMonth(mk)}</span>
                <span className="rv-muted">{U.money(sum)}</span>
              </div>
              {items.map((r) => (
                <button key={r.id} className="rv-item" onClick={() => onOpen(r)}>
                  <div className="rv-item-main">
                    <div className="rv-item-title">
                      {r.merchant || '(가맹점 없음)'}
                      {r.country && r.country !== 'US' && <CountryTag code={r.country} />}
                    </div>
                    <div className="rv-item-sub">
                      {U.prettyDate(r.purchased_at)} · <CategoryPill catKey={r.category} />
                      {U.isSplit(r) && (
                        <span className="rv-split-badge" title="여러 분류로 나뉜 영수증">
                          ⑂{r.splits.length}
                        </span>
                      )}
                      {r.image_path && <span className="rv-clip" title="사진 있음">📎</span>}
                    </div>
                  </div>
                  <div className="rv-item-amt">
                    {U.money(r.total)}
                    {U.isForeign(r) && (
                      <div className="rv-muted rv-small">
                        {U.inCurrency(U.originalTotal(r), r.currency)}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =================================================================
// 정리 (화면용 리포트)
// =================================================================

function Report({ rows, year, ledger, onTaxDoc }) {
  const s = useMemo(() => U.summarize(rows), [rows]);
  const P = window.RV_KIND(ledger.kind);

  function Section({ title, note, items, gross }) {
    if (items.length === 0) return null;
    // 합계에 안 잡히는 칸(수리·가구 등)은 합계도 "쓴 돈"으로 보여준다.
    // 반영액으로 보여주면 늘 0이라 무슨 뜻인지 알 수가 없다.
    const total = gross ? items.reduce((t, e) => t + e.gross, 0) : U.sum(items);
    return (
      <div className="rv-report-sec">
        <div className="rv-report-head">
          <span>{title}</span>
          <strong>{U.money(total)}</strong>
        </div>
        {note && <p className="rv-muted rv-small">{note}</p>}
        <table className="rv-table">
          <tbody>
            {items.map((e) => (
              <tr key={e.cat.key}>
                {P.lineLabel && <td className="rv-line">{e.cat.line}</td>}
                <td>
                  <div>{e.cat.ko}</div>
                  <div className="rv-muted rv-small">{e.cat.en} · {e.n}건</div>
                </td>
                <td className="rv-num">
                  {U.money(e.deduct)}
                  {Math.abs(e.deduct - e.gross) > 0.005 && (
                    <div className="rv-muted rv-small">지출 {U.money(e.gross)}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="rv-screen">
      <div className="rv-topbar">
        <span />
        <strong>{year}년 정리</strong>
        <button className="rv-btn-sm" onClick={onTaxDoc} disabled={rows.length === 0}>
          {P.doc.screenTitle}
        </button>
      </div>
      <div className="rv-body">
        {rows.length === 0 && <div className="rv-empty"><p>이 해에는 자료가 없어.</p></div>}

        {/* 어떤 칸이 몇 개 나오는지는 장부 종류가 정한다 */}
        {P.report.sections.map((sec) => (
          <Section key={sec.group} title={sec.title} note={sec.note}
                   gross={!!sec.gross} items={s.group(sec.group)} />
        ))}

        {rows.length > 0 && (
          <p className="rv-muted rv-small rv-foot">{P.report.foot}</p>
        )}
      </div>
    </div>
  );
}

// =================================================================
// 세무사 제출 자료 — 인쇄하면 그대로 PDF가 된다
// =================================================================

function TaxDoc({ rows, year, ledger, members, onBack }) {
  const P = window.RV_KIND(ledger.kind);       // 문서 생김새는 전부 여기서 온다
  const D = P.doc;
  const C = P.csv;
  const s = useMemo(() => U.summarize(rows), [rows]);
  const prepared = U.today();

  // 각 칸의 합계. gross 인 칸은 "쓴 돈", 아니면 "인정되는 금액".
  const sectionTotal = (sec) => {
    const items = s.group(sec.group);
    return sec.gross ? items.reduce((t, e) => t + e.gross, 0) : U.sum(items);
  };
  // 문서 맨 아래 총계는 gross 칸을 빼고 더한다 (공제액에 수리비를 더하면 안 되니까)
  const grandTotal = D.sections
    .filter((sec) => !sec.gross)
    .reduce((t, sec) => t + sectionTotal(sec), 0);

  // 누적 표가 필요한 장부(집 공사 같은)는 전체 연도를 따로 불러온다.
  // 취득원가는 공사 전체 기간에 걸쳐 쌓이고, 집을 팔 때 필요한 건 그 누적 금액이다.
  const [allRows, setAllRows] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!D.cumulative) return;
    DB.list({ ledgerId: ledger.id }).then(
      (all) => { if (alive) setAllRows(all); },
      () => { if (alive) setAllRows([]); }
    );
    return () => { alive = false; };
  }, [D.cumulative, ledger.id]);

  const lifetime = useMemo(() => {
    if (!allRows) return null;
    const byYear = new Map();
    allRows.forEach((r) => {
      const y = String(r.purchased_at).slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, { y: y, n: 0, counted: 0 });
      const e = byYear.get(y);
      e.n += 1;
      e.counted += U.deductible(r);
    });
    const years = Array.from(byYear.values()).sort((a, b) => a.y.localeCompare(b.y));
    return { years: years, total: years.reduce((t, e) => t + e.counted, 0), n: allRows.length };
  }, [allRows]);

  const nameFor = useCallback((uid) => {
    const m = members.find((x) => x.user_id === uid);
    return m ? U.shortName(m.email) : '—';
  }, [members]);

  // 세무사가 읽을 자료라 영문 표기가 있으면 그걸 쓴다.
  const en = (r, field) => (r[field + '_en'] || r[field] || '');

  const koreanLeft = rows.filter(
    (r) => (hasKorean(r.merchant) && !r.merchant_en) || (hasKorean(r.notes) && !r.notes_en)
  ).length;

  const withImage = rows.filter((r) => r.image_path).length;
  const hasHalf = rows.some((r) => U.lines(r).some((l) => l.cat.deduct > 0 && l.cat.deduct < 1));
  const hasPartial = rows.some((r) => r.business_pct < 100);

  // 외화로 산 것들 — 환율 근거를 문서에 남겨야 한다
  const foreignRows = rows.filter((r) => U.isForeign(r));
  const currencies = Array.from(new Set(foreignRows.map((r) => r.currency)));
  const manualFx = foreignRows.filter((r) => r.fx_source === 'manual').length;

  // 국세청이 요구하는 기록은 날짜·금액·상호·사업 목적 네 가지다.
  // 앞의 셋은 저장할 때 강제되지만 목적은 비어 있을 수 있어서 여기서 센다.
  const missingPurpose = rows.filter((r) => !(r.notes || '').trim() && !(r.notes_en || '').trim());
  const missingMerchant = rows.filter((r) => !(r.merchant || '').trim());
  const noImage = rows.filter((r) => !r.image_path);
  const hasCat = (key) => rows.filter((r) => U.lines(r).some((l) => l.cat.key === key));
  const mealsRows = hasCat('meals');
  const equipmentRows = hasCat('equipment');
  const carRows = hasCat('car');

  const gaps = [];
  if (missingPurpose.length) gaps.push({
    n: missingPurpose.length,
    what: P.form.purposeLabel === 'workDone' ? '무슨 공사였는지 비어 있는 영수증'
                                             : '무슨 지출인지 비어 있는 영수증',
    why: P.form.purposeHelp,
  });
  if (missingMerchant.length) gaps.push({
    n: missingMerchant.length, what: '가맹점 이름이 없는 영수증',
    why: '누구에게 지불했는지가 기록의 기본이야.',
  });
  if (noImage.length) gaps.push({
    n: noImage.length, what: '사진이 없는 영수증',
    why: D.cumulative
      ? '집을 팔 때까지 몇 년이고 보관해야 하는 증빙이야. 종이는 그때까지 안 남아 — 지금 찍어두는 게 나아.'
      : '$75 넘는 지출은 증빙을 보관해야 해. 원본이 있으면 사진만 추가하면 돼.',
  });
  if (koreanLeft > 0) gaps.push({
    n: koreanLeft, what: '한글이 그대로 남은 영수증',
    why: '세무사가 못 읽어. 영문 표기를 채워줘.',
  });

  function exportCsv() {
    // 세무사가 읽을 파일이라 열 이름도 분류명도 전부 영문이다.
    // 분할된 영수증은 줄마다 한 행이 되고, receipt_total 이 같은 값으로 반복돼
    // 어떤 행들이 한 장에서 나왔는지 알아볼 수 있다.
    // 어떤 열이 있는지는 장부 종류가 정한다 (P.csv).
    const head = ['date', C.merchantCol, 'country']
      .concat(C.line ? ['schedule_c_line'] : [])
      .concat(['category'])
      .concat(C.basisFlag ? ['adds_to_basis'] : [])
      .concat(['currency', 'amount_local', 'fx_rate', 'fx_rate_source', 'amount_usd'])
      .concat(C.businessPct ? ['business_use_pct'] : [])
      .concat([C.amountCol,
               'receipt_total_local', 'receipt_total_usd', 'sales_tax_local',
               'payment_method', 'payment_ref', 'split_of_receipt', C.purposeCol,
               'entered_by', 'entered_on', 'receipt_image']);
    const out = [head.join(',')];

    rows.slice().sort((a, b) => a.purchased_at.localeCompare(b.purchased_at)).forEach((r) => {
      const parts = U.lines(r);
      parts.forEach((l) => {
        const row = [r.purchased_at, en(r, 'merchant'), r.country || '']
          .concat(C.line ? [l.cat.line] : [])
          .concat([l.cat.en])
          .concat(C.basisFlag ? [l.cat.deduct > 0 ? 'yes' : 'no'] : [])
          .concat([
            r.currency || 'USD', U.plain(l.amount),
            Number(r.fx_rate || 1).toFixed(8),
            r.fx_source === 'manual' ? 'card statement'
              : r.fx_source === 'same' ? 'n/a (USD)' : 'ECB published rate',
            U.plain(l.usd),
          ])
          .concat(C.businessPct ? [r.business_pct] : [])
          .concat([
            U.plain(l.deductible),
            U.plain(U.originalTotal(r)), U.plain(r.total),
            r.tax == null ? '' : U.plain(r.tax),
            r.payment_method || '', r.payment_ref || '',
            parts.length > 1 ? 'yes' : '',
            [l.note, en(r, 'notes')].filter(Boolean).join(' / '),
            nameFor(r.created_by),
            r.created_at ? String(r.created_at).slice(0, 10) : '',
            r.image_path ? 'on file' : '',
          ]);
        out.push(row.map(U.csvCell).join(','));
      });
    });

    const blob = new Blob(['﻿' + out.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ReceiptVault-' + D.fileTag + year + '-detail.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function Rows({ items, gross }) {
    return items.map((e) => (
      <tr key={e.cat.key}>
        {P.lineLabel && <td className="tx-line">{e.cat.line}</td>}
        <td>{e.cat.en}</td>
        <td className="tx-num">{e.n}</td>
        <td className="tx-num">{U.plain(gross ? e.gross : e.deduct)}</td>
      </tr>
    ));
  }

  // 문서 맨 아래 주석. 어떤 줄을 넣을지는 장부 종류가 고른다(D.notes).
  function note(key) {
    switch (key) {
      case 'deductibleAmounts':
        return <li key={key}>Amounts shown are <strong>deductible amounts</strong>, not gross spend.</li>;
      case 'meals':
        return hasHalf ? <li key={key}>Meals are reported at the 50% deductible rate.</li> : null;
      case 'mixedUse':
        return hasPartial ? (
          <li key={key}>Mixed-use items (e.g. vehicle) are reduced by the recorded
              business-use percentage. Per-receipt percentages are in the CSV.</li>
        ) : null;
      case 'equipment':
        return equipmentRows.length ? (
          <li key={key}><strong>Needs your decision:</strong> {equipmentRows.length} equipment
              purchase{equipmentRows.length > 1 ? 's are' : ' is'} listed under line 13. These are
              capital items — please advise on depreciation vs. Section 179 election.</li>
        ) : null;
      case 'car':
        return carRows.length ? (
          <li key={key}><strong>Incomplete:</strong> vehicle costs (line 9) are receipt-based only.
              No mileage log is kept in this system.</li>
        ) : null;
      case 'notTrackedBusiness':
        return <li key={key}><strong>Not tracked here:</strong> beginning and ending inventory
            (Schedule C Part III), home-office expenses, and any non-receipt items such as
            bank fees drawn directly from the account.</li>;
      case 'basisIntro':
        return <li key={key}>This is <strong>not a deduction schedule.</strong> The amounts above are
            capital improvements to a personal residence, recorded to support an
            adjusted-basis calculation when the home is sold (IRS Pub. 523).</li>;
      case 'basisTest':
        return <li key={key}>Classification follows the standard test — work that adds to the value
            of the home, prolongs its useful life, or adapts it to new uses is treated as an
            improvement; ordinary repairs and maintenance are recorded separately and excluded
            from basis.</li>;
      case 'basisRepairs':
        return <li key={key}><strong>Needs review:</strong> repairs performed as part of the larger
            remodel may themselves be capitalized. Items filed under repairs should be reviewed
            against the scope of work before the basis figure is used.</li>;
      case 'basisNotAdjusted':
        return <li key={key}><strong>Not adjusted here:</strong> energy credits, rebates, insurance
            reimbursements and subsidies received for this work reduce basis and are not netted
            out in these figures. Improvements later removed or replaced should also be backed
            out.</li>;
      case 'basisNotIncluded':
        return <li key={key}><strong>Not included:</strong> the original purchase price of the home,
            settlement costs, and any prior improvements made before this record began.</li>;
      case 'personalNote':
        return <li key={key}>This record is kept for personal reference. It is not a tax schedule
            and no deduction is claimed from it.</li>;
      default:
        return null;
    }
  }

  return (
    <div className="rv-screen">
      <div className="rv-topbar rv-noprint">
        <button className="rv-btn-ghost" onClick={onBack}>← 정리</button>
        <strong>{D.screenTitle}</strong>
        <span />
      </div>

      <div className="rv-body">
        <div className="rv-noprint rv-taxdoc-actions">
          <button className="rv-btn" onClick={() => window.print()}>PDF로 저장 (인쇄)</button>
          <button className="rv-btn-ghost rv-wide" onClick={exportCsv}>거래 내역 CSV 내려받기</button>
          <p className="rv-muted rv-small">
            인쇄 화면에서 <strong>대상</strong>을 <strong>PDF로 저장</strong>으로 바꾸면 파일로 떨어져.
            아래 보이는 그대로 나와. {D.intro}
          </p>
          {gaps.length > 0 && (
            <div className="rv-gaps">
              <div className="rv-gaps-head">보내기 전에 채우면 좋을 것</div>
              {gaps.map((g, i) => (
                <div key={i} className="rv-gap">
                  <span className="rv-gap-n">{g.n}</span>
                  <div>
                    <div>{g.what}</div>
                    <div className="rv-muted rv-small">{g.why}</div>
                  </div>
                </div>
              ))}
              <p className="rv-muted rv-small">
                지금 이대로 보내도 문서는 나와. 다만 위 항목들은 세무사가 결국 되묻는 것들이라,
                지금 채우는 게 나중에 영수증을 다시 뒤지는 것보다 싸.
              </p>
            </div>
          )}
        </div>

        {/* 여기부터가 인쇄되는 영역 */}
        <div className="tx-paper">
          <header className="tx-head">
            <div>
              <h1>{ledger.business_name || ledger.name}</h1>
              <p className="tx-sub">{D.title} {year}</p>
            </div>
            <table className="tx-meta">
              <tbody>
                {ledger.taxpayer_name && (
                  <tr><td>{P.entity.docOwner}</td><td>{ledger.taxpayer_name}</td></tr>
                )}
                <tr><td>Period</td><td>Jan 1 – Dec 31, {year}</td></tr>
                <tr><td>Prepared</td><td>{prepared}</td></tr>
                <tr><td>Records</td><td>{rows.length} receipts</td></tr>
                <tr><td>Currency</td><td>All figures in USD</td></tr>
                <tr><td>Basis</td><td>Cash — dated when paid</td></tr>
              </tbody>
            </table>
          </header>

          {/* 표는 장부 종류가 정한 만큼 나온다 */}
          {D.sections.map((sec) => {
            const items = s.group(sec.group);
            if (!items.length) return null;
            return (
              <section className="tx-sec" key={sec.group}>
                <h2>{sec.h2}</h2>
                <table className="tx-table">
                  <thead>
                    <tr>
                      {P.lineLabel && <th>Line</th>}
                      <th>Category</th>
                      <th className="tx-num">Items</th>
                      <th className="tx-num">
                        {sec.gross ? 'Spent (USD)' : 'Amount (USD)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <Rows items={items} gross={!!sec.gross} />
                    <tr className="tx-total">
                      {P.lineLabel && <td></td>}
                      <td>{sec.total.replace('{year}', year)}</td>
                      <td className="tx-num"></td>
                      <td className="tx-num">{U.plain(sectionTotal(sec))}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            );
          })}

          {D.grand && (
            <section className="tx-sec">
              <table className="tx-table tx-grand">
                <tbody>
                  <tr className="tx-total">
                    <td>{D.grand}</td>
                    <td className="tx-num">{U.plain(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          {D.cumulative && lifetime && lifetime.years.length > 0 && (
            <section className="tx-sec">
              <h2>{D.cumulative.h2}</h2>
              <table className="tx-table">
                <thead>
                  <tr><th>Year</th><th className="tx-num">Receipts</th>
                      <th className="tx-num">{D.cumulative.col}</th></tr>
                </thead>
                <tbody>
                  {lifetime.years.map((e) => (
                    <tr key={e.y}>
                      <td>{e.y}</td>
                      <td className="tx-num">{e.n}</td>
                      <td className="tx-num">{U.plain(e.counted)}</td>
                    </tr>
                  ))}
                  <tr className="tx-total">
                    <td>{D.cumulative.total}</td>
                    <td className="tx-num">{lifetime.n}</td>
                    <td className="tx-num">{U.plain(lifetime.total)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          {foreignRows.length > 0 && (
            <section className="tx-sec">
              <h2>Foreign-currency purchases</h2>
              <table className="tx-table">
                <thead>
                  <tr><th>Date</th><th>Merchant</th><th>Currency</th>
                      <th className="tx-num">Local</th><th className="tx-num">Rate</th>
                      <th className="tx-num">USD</th><th>Rate source</th></tr>
                </thead>
                <tbody>
                  {foreignRows.slice().sort((a, b) => a.purchased_at.localeCompare(b.purchased_at))
                    .map((r) => (
                    <tr key={r.id}>
                      <td>{r.purchased_at}</td>
                      <td>{en(r, 'merchant')}</td>
                      <td>{r.currency}</td>
                      <td className="tx-num">{U.plain(U.originalTotal(r))}</td>
                      <td className="tx-num">{Number(r.fx_rate || 1).toFixed(6)}</td>
                      <td className="tx-num">{U.plain(r.total)}</td>
                      <td>{r.fx_source === 'manual' ? 'card statement' : 'ECB, transaction date'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="tx-notes">
            <h3>Notes</h3>
            <ul>
              {D.notes.map((k) => note(k))}
              {foreignRows.length > 0 && (
                <li>
                  {foreignRows.length} purchase{foreignRows.length > 1 ? 's were' : ' was'} made in{' '}
                  {currencies.join(', ')} and translated to USD at the rate prevailing on the
                  transaction date (European Central Bank published rates)
                  {manualFx > 0 && <>; {manualFx} used the amount actually charged by the card issuer</>}.
                  Per-receipt rates and sources are listed above and in the CSV.
                </li>
              )}
              <li>{withImage} of {rows.length} receipts have a stored image; originals can be
                  provided on request.</li>
              {missingPurpose.length > 0 && (
                <li><strong>{missingPurpose.length}</strong> receipt
                    {missingPurpose.length > 1 ? 's have' : ' has'} no description recorded.</li>
              )}
              {mealsRows.length > 0 && (
                <li>Meals: attendees and business discussion are recorded in the business-purpose
                    field per receipt (see CSV).</li>
              )}
              <li>Category assignments were made by the {D.reviewedBy} at entry and should be
                  reviewed before {D.reviewedBefore}.</li>
            </ul>
          </section>

          <footer className="tx-foot">
            Prepared with ReceiptVault · {prepared}
          </footer>
        </div>
      </div>
    </div>
  );
}

// =================================================================
// 상세
// =================================================================

function Detail({ rec, ledger, members, canWrite, onEdit, onDeleted, onBack }) {
  const [url, setUrl] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const c = window.RV_CAT(rec.category);
  const P = window.RV_KIND(ledger.kind);
  // 신고서 줄번호가 있는 장부면 줄번호를, 없으면 합계에 잡히는지를 보여준다.
  const catLine = (cc) => (P.lineLabel
    ? P.lineLabel + ' ' + cc.line + '번 · ' + cc.en
    : (cc.deduct > 0 ? '' : '합계에 안 들어감 · ') + cc.en);

  useEffect(() => {
    let alive = true;
    if (rec.image_path) DB.imageUrl(rec.image_path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [rec.image_path]);

  const enteredBy = members.find((m) => m.user_id === rec.created_by);

  return (
    <div className="rv-screen">
      <div className="rv-topbar">
        <button className="rv-btn-ghost" onClick={onBack}>← 목록</button>
        <strong>{rec.merchant || '(가맹점 없음)'}</strong>
        {canWrite ? <button className="rv-btn-sm" onClick={onEdit}>수정</button> : <span />}
      </div>
      <div className="rv-body">
        <div className="rv-detail-amt">{U.money(rec.total)}</div>
        {U.isForeign(rec) && (
          <div className="rv-muted">
            {U.inCurrency(U.originalTotal(rec), rec.currency)} · 1 {rec.currency} ={' '}
            {Number(rec.fx_rate).toFixed(6)} USD
            <div className="rv-small">
              {rec.fx_source === 'manual'
                ? '카드 청구액 기준'
                : '유럽중앙은행 공시 환율 (' + (rec.fx_rate_date || rec.purchased_at) + ')'}
            </div>
          </div>
        )}
        <div className="rv-muted">
          {rec.purchased_at} · <CategoryPill catKey={rec.category} />
          {rec.country && <CountryTag code={rec.country} />}
        </div>

        {U.isSplit(rec) ? (
          <div className="rv-splits rv-splits-view">
            <div className="rv-splits-head"><span>분류 나눔</span></div>
            {U.lines(rec).map((l, i) => (
              <div key={i} className="rv-split-line">
                <div>
                  <div>{l.cat.ko}</div>
                  <div className="rv-muted rv-small">{catLine(l.cat)}</div>
                </div>
                <div className="rv-num">{U.money(l.amount)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rv-muted rv-small">{catLine(c)}</p>
        )}

        {Math.abs(U.deductible(rec) - Number(rec.total || 0)) > 0.005 && (
          <p className="rv-small">
            {P.form.businessPct && rec.business_pct < 100
              ? '사업 사용 ' + rec.business_pct + '% · ' : ''}
            {P.counted.ko} {U.money(U.deductible(rec))}
          </p>
        )}

        <p className="rv-muted rv-small">
          {members.length > 1 && (
            <><L k="enteredBy" /> {enteredBy ? U.shortName(enteredBy.email) : '—'} · </>
          )}
          <L k="uploadedAt" /> {rec.created_at ? String(rec.created_at).slice(0, 16).replace('T', ' ') : '—'}
          {rec.payment_ref && <> · {rec.payment_ref}</>}
        </p>

        {rec.notes
          ? <p className="rv-note">{rec.notes}</p>
          : <Banner kind="warn">
              {P.form.purposeMissing}
            </Banner>}
        {url && <div className="rv-preview"><img src={url} alt="영수증" /></div>}

        {canWrite && (confirming ? (
          <div className="rv-confirm">
            <p>이 영수증과 사진을 완전히 지울까? 되돌릴 수 없어.</p>
            <button className="rv-btn-danger" onClick={() => onDeleted(rec)}>삭제</button>
            <button className="rv-btn-ghost" onClick={() => setConfirming(false)}>취소</button>
          </div>
        ) : (
          <button className="rv-btn-ghost rv-wide" onClick={() => setConfirming(true)}>삭제</button>
        ))}
      </div>
    </div>
  );
}

// =================================================================
// 설정 — 장부, 식구, 세무사 자료에 찍힐 이름
// =================================================================

function Settings({ session, ledger, members, isOwner, onReload }) {
  const KIND = window.RV_KIND(ledger.kind);
  const SET = window.RV_CAT_SETS[
    KIND.catSets.indexOf(ledger.cat_set) >= 0 ? ledger.cat_set : KIND.catSets[0]];
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [fields, setFields] = useState({
    name: ledger.name || '',
    business_name: ledger.business_name || '',
    taxpayer_name: ledger.taxpayer_name || '',
  });

  const [quota, setQuota] = useState(null);
  const [diag, setDiag] = useState(null);
  const [diagOpen, setDiagOpen] = useState(false);   // 접어 둔 상태로 시작
  const [refreshing, setRefreshing] = useState(false);

  async function doHardRefresh() {
    setRefreshing(true);
    await window.RV_APP.hardRefresh('settings');
  }

  const loadInvites = useCallback(async () => {
    try { setInvites(await DB.pendingInvites(ledger.id)); } catch (e) {}
  }, [ledger.id]);

  useEffect(() => { loadInvites(); }, [loadInvites]);
  useEffect(() => {
    let alive = true;
    DB.aiQuota().then((q) => { if (alive) setQuota(q); });
    window.RV_APP.diagnostics(session).then((d) => { if (alive) setDiag(d); });
    return () => { alive = false; };
  }, [session]);

  async function saveFields() {
    setErr(''); setMsg('');
    try {
      await DB.updateLedger(ledger.id, fields);
      setMsg('저장했어.');
      onReload();
    } catch (ex) { setErr(ex.message || '저장하지 못했어요.'); }
  }

  async function sendInvite() {
    setErr(''); setMsg('');
    try {
      await DB.invite(ledger.id, email, role);
      setEmail('');
      setMsg('초대해 뒀어. 그 주소로 로그인하면 자동으로 합류돼.');
      loadInvites();
    } catch (ex) { setErr(ex.message || '초대하지 못했어요.'); }
  }

  return (
    <div className="rv-screen">
      <div className="rv-topbar">
        <span />
        <strong>설정</strong>
        {/* 강제 갱신. 큰 버튼 대신 아이콘 하나로 — 자주 쓰지만 자리를 차지할 일은 아니다. */}
        <button className={'rv-icon-btn' + (refreshing ? ' rv-spin' : '')}
                onClick={doHardRefresh} disabled={refreshing}
                title="강제 갱신 (캐시를 지우고 최신 파일을 새로 받아)"
                aria-label="Force Refresh 강제 갱신">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
               stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 11a8 8 0 1 0-2.3 5.7" />
            <polyline points="20 4 20 11 13 11" />
          </svg>
        </button>
      </div>
      <div className="rv-body">
        {msg && <Banner kind="info" onClose={() => setMsg('')}>{msg}</Banner>}
        {err && <Banner kind="error" onClose={() => setErr('')}>{err}</Banner>}

        {/* ---- 장부 정보 ---- */}
        <h3 className="rv-h3">장부</h3>
        <div className="rv-kindtag">
          {KIND.en} <span className="rv-kind-ko">{KIND.ko}</span>
          {KIND.catSets.length > 1 && <span className="rv-kind-ko"> · {SET.ko}</span>}
        </div>
        <p className="rv-muted rv-small">{KIND.desc}</p>
        {isOwner ? (
          <>
            <label className="rv-label">장부 이름
              <input className="rv-input" value={fields.name}
                     onChange={(e) => setFields({ ...fields, name: e.target.value })} />
            </label>
            <label className="rv-label">{KIND.entity.nameLabel}
              <input className="rv-input" placeholder={KIND.entity.namePlaceholder}
                     value={fields.business_name}
                     onChange={(e) => setFields({ ...fields, business_name: e.target.value })} />
            </label>
            <label className="rv-label">{KIND.entity.ownerLabel}
              <input className="rv-input" placeholder="Jenny Ryu"
                     value={fields.taxpayer_name}
                     onChange={(e) => setFields({ ...fields, taxpayer_name: e.target.value })} />
            </label>
            <p className="rv-muted rv-small">
              이 둘은 {KIND.doc.screenTitle} PDF 맨 위에 찍혀. 비워두면 장부 이름이 대신 나와.
            </p>
            <button className="rv-btn" onClick={saveFields}>장부 정보 저장</button>
          </>
        ) : (
          <p className="rv-muted rv-small">
            {ledger.name} · 장부 정보는 주인만 고칠 수 있어.
          </p>
        )}

        <p className="rv-muted rv-small">
          장부를 바꾸거나 새로 만드는 건 <strong>맨 위 장부 이름</strong>을 눌러서 해.
          성격이 다른 지출은 장부를 나누는 게 좋아 — 공방 경비와 집 리모델링은 세금 계산이
          아예 달라서 한 장부에 섞이면 둘 다 못 쓰게 돼.
        </p>

        {/* ---- 식구 ---- */}
        <h3 className="rv-h3">같이 쓰는 사람</h3>
        <div className="rv-members">
          {members.map((m) => (
            <div key={m.user_id} className="rv-member">
              <div>
                <div>{U.shortName(m.email)}{m.user_id === session.user.id ? ' (나)' : ''}</div>
                <div className="rv-muted rv-small">{m.email}</div>
              </div>
              <span className="rv-role">
                {m.role === 'owner' ? '주인' : m.role === 'editor' ? '입력 가능' : '보기만'}
              </span>
            </div>
          ))}
          {invites.map((i) => (
            <div key={i.id} className="rv-member rv-member-pending">
              <div>
                <div>{i.email}</div>
                <div className="rv-muted rv-small">아직 로그인 전 — 초대해 둔 상태</div>
              </div>
              {isOwner && (
                <button className="rv-btn-ghost rv-tiny"
                        onClick={() => DB.cancelInvite(i.id).then(loadInvites)}>취소</button>
              )}
            </div>
          ))}
        </div>

        {isOwner && (
          <>
            <label className="rv-label">초대할 이메일
              <input className="rv-input" type="email" inputMode="email"
                     placeholder="남편 이메일 주소"
                     value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="rv-label">권한
              <select className="rv-input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="editor">입력 가능 — 영수증을 넣고 고칠 수 있어</option>
                <option value="viewer">보기만 — 확인만 하고 못 고쳐</option>
              </select>
            </label>
            <button className="rv-btn" onClick={sendInvite} disabled={!email}>초대하기</button>
            <p className="rv-muted rv-small">
              앱이 메일을 보내지는 않아. 이 주소로 앱에 로그인하기만 하면 자동으로 합류돼.
              그러니 남편에게는 앱 주소를 직접 알려주면 돼.
            </p>
          </>
        )}

        {/* ---- 계정 ---- */}
        <h3 className="rv-h3"><L k="account" /></h3>
        <p className="rv-muted rv-small">{session.user.email}</p>
        <button className="rv-btn-ghost rv-wide" onClick={() => DB.signOut()}><L k="signOut" /></button>

        <h3 className="rv-h3"><L k="aiUsage" /></h3>
        {quota ? (
          <>
            <p className="rv-muted rv-small">
              오늘 {quota.used} / {quota.limit}장 사용
            </p>
            <div className="rv-quota-bar">
              <div className="rv-quota-fill"
                   style={{ width: Math.min(100, (quota.used / quota.limit) * 100) + '%' }} />
            </div>
            <p className="rv-muted rv-small">
              한 사람이 하루에 인식할 수 있는 장수야. 요금이 새는 걸 막는 장치라
              한도에 걸려도 항목을 직접 채워 저장하는 건 그대로 돼. 늘리고 싶으면 말해줘.
            </p>
          </>
        ) : (
          <p className="rv-muted rv-small">
            자동 인식 {AI.available() ? '연결됨' : '아직 연결 전'}
          </p>
        )}

        {/* ---- 데이터와 개인정보 ---- */}
        <h3 className="rv-h3"><L k="dataPrivacy" /></h3>
        <p className="rv-muted rv-small">
          영수증과 사진은 Supabase에 저장되고, <strong>같은 장부에 속한 사람만</strong> 볼 수 있어.
          다른 장부의 자료는 서로 보이지 않아. 영수증 사진을 AI로 읽을 때는 그 이미지가
          Anthropic API로 한 번 전달되고, 결과만 돌아온 뒤 따로 보관되지 않아.
          자동 인식을 끄면 사진은 이 앱 밖으로 나가지 않아.
        </p>

        {/* ---- 점검 ----
             버튼은 맨 위 오른쪽 아이콘으로 옮겼다. 설명만 여기 남긴다 —
             아이콘만 있으면 눌러도 되는 건지 알 수가 없어서. */}
        <h3 className="rv-h3"><L k="maintenance" /></h3>
        <p className="rv-muted rv-small">
          화면 오른쪽 위 <strong>⟳</strong> 가 <strong>강제 갱신</strong>이야.
          저장된 캐시와 서비스워커를 지우고 최신 파일을 새로 받아. 코드를 고쳤는데 화면이
          그대로일 때 누르면 돼. 영수증 자료는 서버에 있으니 지워지지 않아.
        </p>

        {/* ---- 연결 상태 (개발 중에만, 접어 둔다) ---- */}
        {window.RV_APP.isDev() && diag && (
          <>
            <button className="rv-fold" onClick={() => setDiagOpen(!diagOpen)}
                    aria-expanded={diagOpen}>
              <span className="rv-fold-t"><L k="diagnostics" /></span>
              <span className={'rv-fold-c' + (diagOpen ? ' rv-fold-open' : '')}>▾</span>
            </button>
            {diagOpen && (
              <>
                <div className="rv-diag">
                  {diag.map((d) => (
                    <div key={d.k} className={'rv-diag-row' + (d.bad ? ' rv-diag-bad' : '')}>
                      <span className="rv-diag-k">{d.k}</span>
                      <span className="rv-diag-v">{d.v}</span>
                    </div>
                  ))}
                </div>
                <p className="rv-muted rv-small">
                  <strong>Files updated</strong> 는 지금 열려 있는 코드가 언제 서버에 올라간 건지야.
                  파일을 올린 뒤 이 시각이 안 바뀌면 아직 반영이 안 된 거야.
                </p>
              </>
            )}
          </>
        )}

        {/* ---- 앱 정보 ---- */}
        <h3 className="rv-h3"><L k="about" /></h3>
        <div className="rv-about">
          <div className="rv-about-name">{window.RV_CONFIG.APP_NAME}</div>
          <div className="rv-muted rv-small">
            v{window.RV_APP.version()}
            {window.RV_APP.isDev() && <span className="rv-stage">개발중</span>}
          </div>
          <div className="rv-muted rv-small">{window.RV_APP.copyright()}</div>
        </div>
      </div>
    </div>
  );
}

// =================================================================
// 루트
// =================================================================

function App() {
  const [session, setSession] = useState(undefined); // undefined = 확인 중
  const [booting, setBooting] = useState(false);
  const [ledgers, setLedgers] = useState([]);
  const [ledgerId, setLedgerId] = useState(null);
  const [members, setMembers] = useState([]);
  // 강제 갱신으로 돌아왔으면 누르기 전 화면으로 되돌린다
  const [tab, setTab] = useState(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab');
      return ['list', 'report', 'settings'].indexOf(t) >= 0 ? t : 'list';
    } catch (e) { return 'list'; }
  });
  const [sheet, setSheet] = useState(false);   // 장부 고르는 판이 열렸나
  const [mode, setMode] = useState(null);            // null | add | edit | detail | tax
  const [current, setCurrent] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const first = Math.min(window.RV_CONFIG.FIRST_YEAR || now, now);
    const out = [];
    for (let y = now; y >= first; y--) out.push(y);
    return out;
  }, []);

  useEffect(() => {
    if (!DB.configured()) { setSession(null); return; }
    DB.getSession().then(setSession);
    return DB.onAuthChange(setSession);
  }, []);

  // 로그인 직후: 초대를 받아들이고 볼 장부를 고른다
  const boot = useCallback(async () => {
    if (!session) return;
    setBooting(true); setErr('');
    try {
      await DB.claimInvites(session);
      const ls = await DB.listLedgers();
      setLedgers(ls);
      if (ls.length) {
        const remembered = DB.rememberedLedger();
        const pick = ls.find((l) => l.id === remembered) || ls[0];
        setLedgerId(pick.id);
        DB.rememberLedger(pick.id);
      } else {
        setLedgerId(null);
      }
    } catch (ex) {
      setErr(ex.message || '장부를 불러오지 못했어요.');
    } finally {
      setBooting(false);
    }
  }, [session]);

  useEffect(() => { boot(); }, [boot]);

  useEffect(() => {
    if (!ledgerId) { setMembers([]); return; }
    let alive = true;
    DB.members(ledgerId).then(
      (m) => { if (alive) setMembers(m); },
      () => {}
    );
    return () => { alive = false; };
  }, [ledgerId]);

  const load = useCallback(async () => {
    if (!session || !ledgerId) return;
    setLoading(true); setErr('');
    try {
      setRows(await DB.list({ ledgerId: ledgerId, year: year }));
    } catch (ex) {
      setErr(ex.message || '불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, [session, ledgerId, year]);

  useEffect(() => { load(); }, [load]);

  const ledger = ledgers.find((l) => l.id === ledgerId) || null;

  // 개발 중 표시: 버전 + 지금 돌아가는 파일이 언제 올라간 것인지.
  // 버전을 손으로 안 올려도 파일 시각은 저절로 바뀌므로 "갱신됐나"를 이걸로 안다.
  const [stamp, setStamp] = useState('');
  useEffect(() => {
    if (!window.RV_APP.isDev()) return;
    let alive = true;
    window.RV_APP.lastDeployed().then((d) => {
      if (!alive) return;
      const t = d ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
                    String(d.getHours()).padStart(2, '0') + ':' +
                    String(d.getMinutes()).padStart(2, '0') : '';
      setStamp('v' + window.RV_APP.version() + (t ? ' · ' + t : ''));
    });
    return () => { alive = false; };
  }, []);

  // 장부마다 앱 색이 바뀐다. 강조색 두 개만 갈아끼우면 화면 전체가 따라온다.
  const K = ledger ? window.RV_KIND(ledger.kind) : null;
  const skin = (node) => (
    <div className="rv-root"
         style={K ? { '--tan': K.accent, '--tan-dim': K.accentDim } : undefined}>
      {node}
    </div>
  );

  // 예전에 쓴 카드 표기 목록. 입력할 때 골라 쓸 수 있게.
  // 따로 저장하는 표를 두지 않는다 — 이미 넣은 영수증이 곧 목록이다.
  const paymentRefs = useMemo(() => {
    const seen = [];
    rows.forEach((r) => {
      const v = (r.payment_ref || '').trim();
      if (v && seen.indexOf(v) === -1) seen.push(v);
    });
    return seen.sort();
  }, [rows]);
  const myRole = (members.find((m) => m.user_id === (session && session.user.id)) || {}).role;
  const canWrite = myRole === 'owner' || myRole === 'editor';
  const isOwner = myRole === 'owner';

  if (!DB.configured()) {
    return (
      <div className="rv-center">
        <div className="rv-card">
          <div className="rv-logo">ReceiptVault</div>
          <Banner kind="warn">
            <code>config.js</code> 에 Supabase 주소와 anon key를 아직 안 넣었어.
            그 두 값을 채우고 새로고침하면 로그인 화면이 나와.
          </Banner>
        </div>
      </div>
    );
  }

  if (session === undefined) return <div className="rv-center"><Spinner /></div>;
  if (session === null) return <SignIn />;
  if (booting) return <div className="rv-center"><Spinner label="장부 여는 중..." /></div>;

  if (!ledger || mode === 'newledger') {
    return (
      <StartLedger
        session={session}
        onMade={(made) => {
          if (made) { DB.rememberLedger(made.id); setLedgerId(made.id); }
          setMode(null);
          boot();
        }}
        onCancel={ledger ? () => setMode(null) : null}
      />
    );
  }

  if (mode === 'add' || mode === 'edit') {
    return skin(
      <ReceiptForm
        initial={mode === 'edit' ? current : null}
        ledger={ledger}
        paymentRefs={paymentRefs}
        session={session}
        onDone={() => { setMode(null); setCurrent(null); load(); }}
        onCancel={() => setMode(mode === 'edit' ? 'detail' : null)}
      />
    );
  }

  if (mode === 'detail' && current) {
    return skin(
      <Detail
        rec={current}
        ledger={ledger}
        members={members}
        canWrite={canWrite}
        onEdit={() => setMode('edit')}
        onBack={() => { setMode(null); setCurrent(null); }}
        onDeleted={async (r) => {
          try { await DB.remove(r); } catch (ex) { setErr(ex.message); }
          setMode(null); setCurrent(null); load();
        }}
      />
    );
  }

  if (mode === 'tax') {
    return skin(
      <TaxDoc rows={rows} year={year} ledger={ledger} members={members}
              onBack={() => setMode(null)} />
    );
  }

  return skin(
    <div className="rv-app">
      {/* 어느 장부를 보고 있는지 — 늘 맨 위에 */}
      <LedgerBar ledger={ledger} ledgers={ledgers} stamp={stamp}
                 onOpen={() => setSheet(true)} />

      {sheet && (
        <LedgerSheet
          ledger={ledger} ledgers={ledgers}
          onPick={(id) => { DB.rememberLedger(id); setLedgerId(id); setMode(null); }}
          onNew={() => setMode('newledger')}
          onClose={() => setSheet(false)}
        />
      )}

      {err && <Banner kind="error" onClose={() => setErr('')}>{err}</Banner>}

      {tab === 'list' && (
        <ReceiptList
          rows={rows} loading={loading} year={year} years={years} onYear={setYear}
          canWrite={canWrite}
          onAdd={() => setMode('add')}
          onOpen={(r) => { setCurrent(r); setMode('detail'); }}
        />
      )}

      {tab === 'report' && (
        <Report rows={rows} year={year} ledger={ledger} onTaxDoc={() => setMode('tax')} />
      )}

      {tab === 'settings' && (
        <Settings
          session={session} ledger={ledger} members={members}
          isOwner={isOwner} onReload={boot}
        />
      )}

      <nav className="rv-tabs">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>
          <L k="receipts" /></button>
        <button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>
          <L k="summary" /></button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>
          <L k="settings" /></button>
      </nav>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
