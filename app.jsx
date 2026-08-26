// app.jsx — 화면 전부. <script type="text/babel"> 로 로드된다.
// React 는 CDN 에서 온 전역이므로 import 하지 않고 그대로 쓴다.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const U = window.RV_UTIL;
const DB = window.RV_DB;
const AI = window.RV_AI;
const CATS = window.RV_CATEGORIES;

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

function CategoryPill({ catKey }) {
  const c = window.RV_CAT(catKey);
  return (
    <span className={'rv-pill rv-pill-' + c.group} title={c.en + ' · line ' + c.line}>
      {c.ko}
    </span>
  );
}

// 분류 선택 드롭다운. 원가/경비를 optgroup 으로 갈라 놓는다.
function CategorySelect({ value, onChange }) {
  return (
    <select className="rv-input" value={value} onChange={(e) => onChange(e.target.value)}>
      <optgroup label="매출원가 — 팔 물건에 들어간 것">
        {CATS.filter((c) => c.group === 'cogs').map((c) => (
          <option key={c.key} value={c.key}>{c.ko}</option>
        ))}
      </optgroup>
      <optgroup label="경비">
        {CATS.filter((c) => c.group === 'expense').map((c) => (
          <option key={c.key} value={c.key}>{c.ko}</option>
        ))}
      </optgroup>
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
// 장부가 아직 없을 때
// =================================================================

function StartLedger({ session, onMade }) {
  const [name, setName] = useState('우리 공방');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function make() {
    setBusy(true); setErr('');
    try {
      const l = await DB.createLedger(session, name.trim() || '우리 공방');
      onMade(l);
    } catch (ex) {
      setErr(ex.message || '장부를 만들지 못했어요.');
      setBusy(false);
    }
  }

  return (
    <div className="rv-center">
      <div className="rv-card">
        <div className="rv-logo">장부 만들기</div>
        <p className="rv-muted rv-small">
          영수증이 쌓이는 곳이야. 하나만 만들어 두고, 나중에 설정에서 다른 사람을 불러
          같이 쓸 수 있어.
        </p>
        <label className="rv-label">장부 이름
          <input className="rv-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="rv-btn" onClick={make} disabled={busy}>
          {busy ? '만드는 중...' : '만들기'}
        </button>
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
  category: 'cogs_material',
  total: '',
  tax: '',
  payment_method: 'card',
  business_pct: 100,
  notes: '',
  source: 'manual',
  splits: [],
};

function ReceiptForm({ initial, ledgerId, session, onDone, onCancel }) {
  const [rec, setRec] = useState(() => Object.assign({}, BLANK, initial || {}));
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

  // ---- 분할 ----
  const splits = rec.splits || [];
  const splitting = splits.length > 0;
  const remainder = U.splitRemainder(rec.total, splits);

  function startSplit() {
    setRec((r) => Object.assign({}, r, {
      splits: [
        { category: r.category, amount: r.total || '', note: '' },
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
        const got = await AI.extract(small);

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

        setRec((r) => Object.assign({}, r, {
          splits: aiSplits,
          purchased_at: got.purchased_at || r.purchased_at,
          merchant: got.merchant || r.merchant,
          total: got.total != null ? String(got.total) : r.total,
          tax: got.tax != null ? String(got.tax) : r.tax,
          payment_method: got.payment_method || r.payment_method,
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
    if (!rec.purchased_at) return setErr('날짜를 넣어줘.');
    if (!rec.total || isNaN(Number(rec.total))) return setErr('금액을 숫자로 넣어줘.');
    if (splitting && remainder !== 0) {
      return setErr(
        '분할한 금액의 합이 총액과 안 맞아. ' +
        (remainder > 0 ? U.money(remainder) + ' 남았어.' : U.money(-remainder) + ' 초과했어.')
      );
    }

    setBusy('저장하는 중...'); setErr('');
    try {
      const saved = await DB.save(Object.assign({}, rec, { needs_review: false }), ledgerId, session);
      if (blob) {
        setBusy('사진 올리는 중...');
        await DB.uploadImage(ledgerId, saved.id, blob);
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
    total: Number(rec.total) || 0,
    category: rec.category,
    business_pct: rec.business_pct,
    splits: splitting && remainder === 0 ? splits : null,
  };
  const dedu = U.deductible(calcBase);
  const halfOnly = U.lines(calcBase).some((l) => l.cat.deduct < 1);

  return (
    <div className="rv-screen">
      <div className="rv-topbar">
        <button className="rv-btn-ghost" onClick={onCancel}>취소</button>
        <strong>{editing ? '영수증 수정' : '영수증 추가'}</strong>
        <button className="rv-btn-sm" onClick={save} disabled={!!busy}>저장</button>
      </div>

      <div className="rv-body">
        {busy && <Spinner label={busy} />}
        {err && <Banner kind="error" onClose={() => setErr('')}>{err}</Banner>}

        {rec.needs_review && (
          <Banner kind="warn">
            AI가 채운 값이야. 금액과 날짜만 눈으로 확인하고 저장해줘.
          </Banner>
        )}

        <div className="rv-photo-row">
          <button className="rv-btn-ghost rv-grow" onClick={() => cameraRef.current.click()}>
            📷 영수증 촬영
          </button>
          <button className="rv-btn-ghost rv-grow" onClick={() => fileRef.current.click()}>
            🖼 스크린샷 · 갤러리
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

        <label className="rv-label">날짜
          <input className="rv-input" type="date" value={rec.purchased_at}
                 onChange={(e) => set('purchased_at', e.target.value)} />
        </label>

        <label className="rv-label">가맹점
          <input className="rv-input" type="text" placeholder="Tandy Leather"
                 value={rec.merchant} onChange={(e) => set('merchant', e.target.value)} />
        </label>

        <div className="rv-row">
          <label className="rv-label rv-grow">합계 금액
            <input className="rv-input" type="number" inputMode="decimal" step="0.01"
                   placeholder="0.00" value={rec.total}
                   onChange={(e) => set('total', e.target.value)} />
          </label>
          <label className="rv-label rv-grow">세금 (선택)
            <input className="rv-input" type="number" inputMode="decimal" step="0.01"
                   placeholder="0.00" value={rec.tax || ''}
                   onChange={(e) => set('tax', e.target.value)} />
          </label>
        </div>

        {!splitting ? (
          <>
            <label className="rv-label">분류
              <CategorySelect value={rec.category} onChange={(v) => set('category', v)} />
            </label>
            <p className="rv-muted rv-small">
              Schedule C {cat.line}번 · {cat.en}
              {cat.hint ? ' — ' + cat.hint : ''}
            </p>
            <button className="rv-btn-ghost rv-split-start" onClick={startSplit}>
              ⑂ 분류 나누기
            </button>
            <p className="rv-muted rv-small">
              가죽이랑 공구를 한 번에 산 영수증처럼, 한 장을 여러 분류로 쪼갤 때.
            </p>
          </>
        ) : (
          <div className="rv-splits">
            <div className="rv-splits-head">
              <span>분류 나누기</span>
              <span className={remainder === 0 ? 'rv-ok rv-small' : 'rv-warn-text rv-small'}>
                {remainder === 0
                  ? '총액과 일치'
                  : remainder > 0
                    ? U.money(remainder) + ' 남음'
                    : U.money(-remainder) + ' 초과'}
              </span>
            </div>

            {splits.map((s, i) => {
              const sc = window.RV_CAT(s.category);
              return (
                <div key={i} className="rv-split-row">
                  <div className="rv-split-top">
                    <CategorySelect value={s.category} onChange={(v) => setSplit(i, 'category', v)} />
                    <button className="rv-split-x" onClick={() => removeSplit(i)} title="이 줄 지우기">✕</button>
                  </div>
                  <div className="rv-split-bottom">
                    <input className="rv-input" type="number" inputMode="decimal" step="0.01"
                           placeholder="0.00" value={s.amount}
                           onChange={(e) => setSplit(i, 'amount', e.target.value)} />
                    {remainder !== 0 && (
                      <button className="rv-btn-ghost rv-split-fill" onClick={() => fillRemainder(i)}>
                        나머지 넣기
                      </button>
                    )}
                  </div>
                  <p className="rv-muted rv-small">Schedule C {sc.line}번 · {sc.en}</p>
                </div>
              );
            })}

            <button className="rv-btn-ghost rv-wide-sm" onClick={addSplit}>+ 줄 추가</button>
            <p className="rv-muted rv-small">
              합계가 총액 {U.money(Number(rec.total) || 0)} 과 맞아야 저장돼.
              줄을 하나만 남기고 지우면 분할이 자동으로 풀려.
            </p>
          </div>
        )}

        <div className="rv-row">
          <label className="rv-label rv-grow">결제 수단
            <select className="rv-input" value={rec.payment_method || 'card'}
                    onChange={(e) => set('payment_method', e.target.value)}>
              <option value="card">카드</option>
              <option value="cash">현금</option>
              <option value="transfer">계좌이체</option>
              <option value="other">기타</option>
            </select>
          </label>
          <label className="rv-label rv-grow">사업 사용 비율
            <input className="rv-input" type="number" min="0" max="100" step="5"
                   value={rec.business_pct}
                   onChange={(e) => set('business_pct', e.target.value)} />
          </label>
        </div>
        {Number(rec.business_pct) < 100 && (
          <p className="rv-muted rv-small">
            개인 겸용 지출이라 {rec.business_pct}%만 사업 경비로 잡혀.
          </p>
        )}

        <label className="rv-label">메모
          <textarea className="rv-input" rows="2" placeholder="무엇을 샀는지 한 줄"
                    value={rec.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </label>

        {Number(rec.total) > 0 && (
          <div className="rv-deduct">
            공제 반영액 <strong>{U.money(dedu)}</strong>
            {halfOnly && <span className="rv-muted"> (식비는 50%만 인정)</span>}
          </div>
        )}

        <button className="rv-btn rv-wide" onClick={save} disabled={!!busy}>저장</button>
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
                    <div className="rv-item-title">{r.merchant || '(가맹점 없음)'}</div>
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
                  <div className="rv-item-amt">{U.money(r.total)}</div>
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

function Report({ rows, year, onTaxDoc }) {
  const s = useMemo(() => U.summarize(rows), [rows]);

  function Section({ title, note, items }) {
    if (items.length === 0) return null;
    return (
      <div className="rv-report-sec">
        <div className="rv-report-head">
          <span>{title}</span>
          <strong>{U.money(U.sum(items))}</strong>
        </div>
        {note && <p className="rv-muted rv-small">{note}</p>}
        <table className="rv-table">
          <tbody>
            {items.map((e) => (
              <tr key={e.cat.key}>
                <td className="rv-line">{e.cat.line}</td>
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
          세무사 자료
        </button>
      </div>
      <div className="rv-body">
        {rows.length === 0 && <div className="rv-empty"><p>이 해에는 자료가 없어.</p></div>}
        <Section title="매출원가 (Schedule C Part III)"
                 note="판매할 물건에 직접 들어간 재료."
                 items={s.cogs} />
        <Section title="경비 (Schedule C Part II)"
                 note="신고서와 같은 줄번호 순서로 정렬돼 있어."
                 items={s.expense} />
        {rows.length > 0 && (
          <p className="rv-muted rv-small rv-foot">
            표시된 금액은 사업 사용 비율과 식비 50% 규칙을 반영한 <strong>공제 반영액</strong>이야.
            실제 지출액이 다르면 아래에 함께 표시돼. 신고 전에는 회계사와 한 번 맞춰보는 걸 권해 —
            나는 세무 자문을 할 수 있는 입장이 아니야.
          </p>
        )}
      </div>
    </div>
  );
}

// =================================================================
// 세무사 제출 자료 — 인쇄하면 그대로 PDF가 된다
// =================================================================

function TaxDoc({ rows, year, ledger, members, onBack }) {
  const s = useMemo(() => U.summarize(rows), [rows]);
  const cogsTotal = U.sum(s.cogs);
  const expTotal = U.sum(s.expense);
  const prepared = U.today();

  const withImage = rows.filter((r) => r.image_path).length;
  const hasHalf = s.expense.some((e) => e.cat.deduct < 1);
  const hasPartial = rows.some((r) => r.business_pct < 100);

  const nameFor = useCallback((uid) => {
    const m = members.find((x) => x.user_id === uid);
    return m ? U.shortName(m.email) : '—';
  }, [members]);

  function exportCsv() {
    // 세무사가 읽을 파일이라 열 이름도 분류명도 전부 영문이다.
    // 분할된 영수증은 줄마다 한 행이 되고, receipt_total 이 같은 값으로 반복돼
    // 어떤 행들이 한 장에서 나왔는지 알아볼 수 있다.
    const head = ['date', 'merchant', 'schedule_c_line', 'category', 'amount',
                  'business_use_pct', 'deductible', 'receipt_total', 'sales_tax',
                  'payment_method', 'split_of_receipt', 'entered_by', 'notes', 'receipt_image'];
    const out = [head.join(',')];

    rows.slice().sort((a, b) => a.purchased_at.localeCompare(b.purchased_at)).forEach((r) => {
      const parts = U.lines(r);
      parts.forEach((l) => {
        out.push([
          r.purchased_at, r.merchant, l.cat.line, l.cat.en,
          U.plain(l.amount), r.business_pct, U.plain(l.deductible),
          U.plain(r.total), r.tax == null ? '' : U.plain(r.tax),
          r.payment_method || '',
          parts.length > 1 ? 'yes' : '',
          nameFor(r.created_by),
          [l.note, r.notes].filter(Boolean).join(' / '),
          r.image_path ? 'on file' : '',
        ].map(U.csvCell).join(','));
      });
    });

    const blob = new Blob(['﻿' + out.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ReceiptVault-' + year + '-detail.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function Rows({ items }) {
    return items.map((e) => (
      <tr key={e.cat.key}>
        <td className="tx-line">{e.cat.line}</td>
        <td>{e.cat.en}</td>
        <td className="tx-num">{e.n}</td>
        <td className="tx-num">{U.plain(e.deduct)}</td>
      </tr>
    ));
  }

  return (
    <div className="rv-screen">
      <div className="rv-topbar rv-noprint">
        <button className="rv-btn-ghost" onClick={onBack}>← 정리</button>
        <strong>세무사 자료</strong>
        <span />
      </div>

      <div className="rv-body">
        <div className="rv-noprint rv-taxdoc-actions">
          <button className="rv-btn" onClick={() => window.print()}>PDF로 저장 (인쇄)</button>
          <button className="rv-btn-ghost rv-wide" onClick={exportCsv}>거래 내역 CSV 내려받기</button>
          <p className="rv-muted rv-small">
            인쇄 화면에서 <strong>대상</strong>을 <strong>PDF로 저장</strong>으로 바꾸면 파일로 떨어져.
            아래 보이는 그대로 나와. 세무사에게는 이 PDF 한 장과 CSV를 같이 보내면 돼.
          </p>
        </div>

        {/* 여기부터가 인쇄되는 영역 */}
        <div className="tx-paper">
          <header className="tx-head">
            <div>
              <h1>{ledger.business_name || ledger.name}</h1>
              <p className="tx-sub">Business Expense Summary — Tax Year {year}</p>
            </div>
            <table className="tx-meta">
              <tbody>
                {ledger.taxpayer_name && (
                  <tr><td>Taxpayer</td><td>{ledger.taxpayer_name}</td></tr>
                )}
                <tr><td>Period</td><td>Jan 1 – Dec 31, {year}</td></tr>
                <tr><td>Prepared</td><td>{prepared}</td></tr>
                <tr><td>Records</td><td>{rows.length} receipts</td></tr>
              </tbody>
            </table>
          </header>

          {s.cogs.length > 0 && (
            <section className="tx-sec">
              <h2>Part III — Cost of Goods Sold</h2>
              <table className="tx-table">
                <thead>
                  <tr><th>Line</th><th>Category</th><th className="tx-num">Items</th>
                      <th className="tx-num">Amount (USD)</th></tr>
                </thead>
                <tbody>
                  <Rows items={s.cogs} />
                  <tr className="tx-total">
                    <td></td><td>Total cost of goods sold</td>
                    <td className="tx-num"></td>
                    <td className="tx-num">{U.plain(cogsTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          {s.expense.length > 0 && (
            <section className="tx-sec">
              <h2>Part II — Expenses</h2>
              <table className="tx-table">
                <thead>
                  <tr><th>Line</th><th>Category</th><th className="tx-num">Items</th>
                      <th className="tx-num">Amount (USD)</th></tr>
                </thead>
                <tbody>
                  <Rows items={s.expense} />
                  <tr className="tx-total">
                    <td></td><td>Total expenses</td>
                    <td className="tx-num"></td>
                    <td className="tx-num">{U.plain(expTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          <section className="tx-sec">
            <table className="tx-table tx-grand">
              <tbody>
                <tr className="tx-total">
                  <td>Total deductible, all categories</td>
                  <td className="tx-num">{U.plain(cogsTotal + expTotal)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="tx-notes">
            <h3>Notes</h3>
            <ul>
              <li>Amounts shown are <strong>deductible amounts</strong>, not gross spend.</li>
              {hasHalf && <li>Meals (line 24b) are reported at the 50% deductible rate.</li>}
              {hasPartial && (
                <li>Mixed-use items (e.g. vehicle) are reduced by the recorded
                    business-use percentage. Per-receipt percentages are in the CSV.</li>
              )}
              <li>{withImage} of {rows.length} receipts have a stored image; originals can be
                  provided on request.</li>
              <li>Category assignments were made by the taxpayer at the time of entry and
                  should be reviewed before filing.</li>
              <li>Inventory (Schedule C Part III, beginning and ending) is not tracked here.</li>
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

function Detail({ rec, members, canWrite, onEdit, onDeleted, onBack }) {
  const [url, setUrl] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const c = window.RV_CAT(rec.category);

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
        <div className="rv-muted">{rec.purchased_at} · <CategoryPill catKey={rec.category} /></div>

        {U.isSplit(rec) ? (
          <div className="rv-splits rv-splits-view">
            <div className="rv-splits-head"><span>분류 나눔</span></div>
            {U.lines(rec).map((l, i) => (
              <div key={i} className="rv-split-line">
                <div>
                  <div>{l.cat.ko}</div>
                  <div className="rv-muted rv-small">Schedule C {l.cat.line}번 · {l.cat.en}</div>
                </div>
                <div className="rv-num">{U.money(l.amount)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rv-muted rv-small">Schedule C {c.line}번 · {c.en}</p>
        )}

        {Math.abs(U.deductible(rec) - Number(rec.total || 0)) > 0.005 && (
          <p className="rv-small">
            {rec.business_pct < 100 ? '사업 사용 ' + rec.business_pct + '% · ' : ''}
            공제 반영 {U.money(U.deductible(rec))}
          </p>
        )}

        {members.length > 1 && (
          <p className="rv-muted rv-small">
            넣은 사람 {enteredBy ? U.shortName(enteredBy.email) : '—'}
          </p>
        )}

        {rec.notes && <p className="rv-note">{rec.notes}</p>}
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

function Settings({ session, ledger, ledgers, members, isOwner, onSwitch, onReload }) {
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

  const loadInvites = useCallback(async () => {
    try { setInvites(await DB.pendingInvites(ledger.id)); } catch (e) {}
  }, [ledger.id]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

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
      <div className="rv-topbar"><span /><strong>설정</strong><span /></div>
      <div className="rv-body">
        {msg && <Banner kind="info" onClose={() => setMsg('')}>{msg}</Banner>}
        {err && <Banner kind="error" onClose={() => setErr('')}>{err}</Banner>}

        <p className="rv-muted">{session.user.email} 로 로그인됨</p>

        {ledgers.length > 1 && (
          <label className="rv-label">보고 있는 장부
            <select className="rv-input" value={ledger.id}
                    onChange={(e) => onSwitch(e.target.value)}>
              {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}

        {/* ---- 장부 정보 ---- */}
        <h3 className="rv-h3">장부</h3>
        {isOwner ? (
          <>
            <label className="rv-label">장부 이름
              <input className="rv-input" value={fields.name}
                     onChange={(e) => setFields({ ...fields, name: e.target.value })} />
            </label>
            <label className="rv-label">사업체명 (세무사 자료 머리말)
              <input className="rv-input" placeholder="Maedeup Leather Studio"
                     value={fields.business_name}
                     onChange={(e) => setFields({ ...fields, business_name: e.target.value })} />
            </label>
            <label className="rv-label">납세자명
              <input className="rv-input" placeholder="Jenny Ryu"
                     value={fields.taxpayer_name}
                     onChange={(e) => setFields({ ...fields, taxpayer_name: e.target.value })} />
            </label>
            <p className="rv-muted rv-small">
              이 둘은 세무사에게 보내는 PDF 맨 위에 찍혀. 비워두면 장부 이름이 대신 나와.
            </p>
            <button className="rv-btn" onClick={saveFields}>장부 정보 저장</button>
          </>
        ) : (
          <p className="rv-muted rv-small">
            {ledger.name} · 장부 정보는 주인만 고칠 수 있어.
          </p>
        )}

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

        <h3 className="rv-h3">기타</h3>
        <p className="rv-muted rv-small">
          통화 {window.RV_CONFIG.CURRENCY} · 자동 인식 {AI.available() ? '연결됨' : '아직 연결 전'}
        </p>
        <button className="rv-btn-ghost rv-wide" onClick={() => DB.signOut()}>로그아웃</button>
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
  const [tab, setTab] = useState('list');
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

  if (!ledger) {
    return <StartLedger session={session} onMade={() => boot()} />;
  }

  if (mode === 'add' || mode === 'edit') {
    return (
      <ReceiptForm
        initial={mode === 'edit' ? current : null}
        ledgerId={ledgerId}
        session={session}
        onDone={() => { setMode(null); setCurrent(null); load(); }}
        onCancel={() => setMode(mode === 'edit' ? 'detail' : null)}
      />
    );
  }

  if (mode === 'detail' && current) {
    return (
      <Detail
        rec={current}
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
    return (
      <TaxDoc rows={rows} year={year} ledger={ledger} members={members}
              onBack={() => setMode(null)} />
    );
  }

  return (
    <div className="rv-app">
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
        <Report rows={rows} year={year} onTaxDoc={() => setMode('tax')} />
      )}

      {tab === 'settings' && (
        <Settings
          session={session} ledger={ledger} ledgers={ledgers} members={members}
          isOwner={isOwner}
          onSwitch={(id) => { DB.rememberLedger(id); setLedgerId(id); }}
          onReload={boot}
        />
      )}

      <nav className="rv-tabs">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>영수증</button>
        <button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>정리</button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>설정</button>
      </nav>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
