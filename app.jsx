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
      <span className="rv-pill-ko">{c.ko}</span>
      {/* 세무사 자료에 실제로 찍히는 이름. 화면에서 미리 눈에 익어야
          나중에 문서를 봤을 때 "이게 그거였구나" 가 된다.
          자리가 모자라면 이쪽이 먼저 줄어든다. */}
      <span className="rv-pill-en">{c.en}</span>
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
            {/* 한글 먼저, 영문은 뒤에. 세무사 자료에 실제로 찍히는 이름이라
                고르는 순간 눈에 익어 있어야 한다.
                <option> 안에서는 글자 크기를 못 바꾸니 · 로만 가른다. */}
            {items.map((c) => (
              <option key={c.key} value={c.key}>{c.ko} · {c.en}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

// =================================================================
// 로그인 (비밀번호 없음 — 이메일로 링크가 온다)
// =================================================================

// 앱 표시. 대문과 로그인 화면이 같은 얼굴을 쓰도록 한 군데서 그린다.
// icon.svg 를 <img> 로 부르지 않고 여기 그려 넣는다 — 파일을 따로 받으면
// 그 순간 한 번 깜빡이고, 대문은 깜빡이면 안 되는 화면이다.
function Mark({ size }) {
  const s = size || 64;
  return (
    <svg className="rv-mark" viewBox="0 0 512 512" width={s} height={s} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="var(--bg)" />
      <path fill="var(--tan)" d="M146 108h220a10 10 0 0 1 10 10v268l-27.5-20-27.5 20-27.5-20-27.5 20-27.5-20-27.5 20-27.5-20-27.5 20-27.5-20-27.5 20V118a10 10 0 0 1 10-10z" />
      <g fill="var(--bg)">
        <rect x="182" y="168" width="148" height="18" rx="9" />
        <rect x="182" y="216" width="112" height="14" rx="7" />
        <rect x="182" y="256" width="128" height="14" rx="7" />
        <rect x="182" y="296" width="90" height="14" rx="7" />
      </g>
    </svg>
  );
}

// 대문. 홈 화면에서 열면 앱이 뜨기까지 잠깐 빈 화면이 보이는데,
// 그 자리를 이름으로 채운다. 준비가 끝나면 스르르 사라진다.
function Splash({ out }) {
  return (
    <div className={'rv-splash' + (out ? ' rv-splash-out' : '')} aria-hidden="true">
      <div className="rv-splash-in">
        <Mark size={104} />
        <div className="rv-splash-name">ReceiptVault</div>
        <div className="rv-splash-sub">영수증과 세금 자료</div>
      </div>
      <div className="rv-splash-foot">© {window.RV_CONFIG.COPYRIGHT_YEAR || 2026}{' '}
        {window.RV_CONFIG.DEVELOPER || 'Jenny Ryu'}</div>
    </div>
  );
}

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
        {/* 대문과 같은 얼굴로 이어지게. 로그인 화면이 대문의 다음 장처럼 보인다. */}
        <div className="rv-signin-head">
          <Mark size={54} />
          <div>
            <div className="rv-logo">ReceiptVault</div>
            <p className="rv-muted rv-small rv-signin-sub">가죽공방 경비 · Schedule C 정리</p>
          </div>
        </div>

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

function LedgerBar({ ledger, ledgers, stamp, refreshing, onOpen, onRefresh }) {
  const K = window.RV_KIND(ledger.kind);
  // 막대 전체를 버튼으로 두면 안에 새로고침 버튼을 넣을 수 없다(버튼 안의 버튼).
  // 그래서 왼쪽 넓은 부분만 버튼으로 두고 ⟳ 는 따로 세운다.
  return (
    <div className="rv-ledgerbar">
      <button className="rv-ledgerbar-main" onClick={onOpen}>
        <span className="rv-ledgerbar-icon">{K.icon}</span>
        <span className="rv-ledgerbar-mid">
          <span className="rv-ledgerbar-name">{ledger.name}</span>
          <span className="rv-ledgerbar-kind">
            {K.en} · {K.ko}
            {/* 마지막으로 파일이 올라간 시각. 갱신됐는지 여기서 바로 안다.
                버전 번호는 설정 → 앱 정보에 있다. */}
            {stamp && <span className="rv-ledgerbar-ver"> · 갱신 {stamp}</span>}
          </span>
        </span>
        <span className="rv-ledgerbar-swap">
          {ledgers.length > 1 ? '장부 바꾸기 ▾' : '장부 ▾'}
        </span>
      </button>

      <button className={'rv-icon-btn' + (refreshing ? ' rv-spin' : '')}
              onClick={onRefresh} disabled={refreshing}
              title="새로고침 (최신 파일을 새로 받아)"
              aria-label="Force Refresh 강제 갱신">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
             stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <polyline points="20 4 20 11 13 11" />
        </svg>
      </button>
    </div>
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

// ---- 앱 안에서 바로 찍는 카메라 ----
//
// 폰의 카메라 앱을 부르는 <input capture> 는 안드로이드에서 우리 화면을 통째로
// 죽여버린다 ("찍고 왔는데 아무 일도 안 일어나"의 진짜 원인). 여기서는 화면을
// 떠나지 않는다 — 영상만 받아서 캔버스에 한 장 떠낸다. 앱이 죽을 일이 없다.
//
// 찍고 나면 바로 쓰지 않고 한 번 보여준다. 흐리게 찍힌 사진을 그대로 AI에
// 보내면 하루 인식 한도만 축나기 때문이다.
function InAppCamera({ onShot, onCancel, onFail }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [err, setErr] = useState('');
  const [shot, setShot] = useState(null);      // { blob, url }
  const [ready, setReady] = useState(false);
  const [shooting, setShooting] = useState(false);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  useEffect(() => {
    let alive = true;
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) {
      setErr('이 브라우저에서는 앱 안 촬영이 안 돼.');
      return;
    }
    // 뒷면 카메라를, 되도록 크게. 영수증은 잔글씨라 해상도가 곧 인식률이다.
    md.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 2560 }, height: { ideal: 1440 },
      },
      audio: false,
    }).then(
      (stream) => {
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setReady(true);
      },
      (ex) => {
        if (!alive) return;
        const n = ex && ex.name;
        setErr(
          n === 'NotAllowedError'
            ? '카메라 권한이 막혀 있어. 주소창 왼쪽 자물쇠 → 권한 → 카메라를 허용으로 바꿔줘.'
            : n === 'NotFoundError' ? '카메라를 찾지 못했어.'
            : '카메라를 열지 못했어 (' + (n || ex) + ').'
        );
      }
    );
    return () => {
      alive = false;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 찍은 사진을 보다가 "다시 찍기" 를 누르면 <video> 가 새로 만들어진다.
  // 그때 영상을 다시 물려주지 않으면 까만 화면만 남는다.
  useEffect(() => {
    if (shot || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {});
  }, [shot]);

  function stop() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  // 2560x1440 을 JPEG 로 만드는 데 폰에서는 몇백 ms 걸린다.
  // 그 사이 한 번 더 누르면 두 장이 만들어지고 앞의 것은 메모리에 갇힌다.
  function take() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || shooting) return;
    setShooting(true);
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      setShooting(false);
      if (!b) { setErr('사진을 만들지 못했어. 다시 눌러줄래?'); return; }
      const url = URL.createObjectURL(b);
      // 셔터와 결과 사이에 닫혔으면 그냥 버린다
      if (!aliveRef.current) { try { URL.revokeObjectURL(url); } catch (e) {} return; }
      setShot({ blob: b, url: url });
    }, 'image/jpeg', 0.92);
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
  }

  function use() {
    const b = shot.blob;
    stop();
    URL.revokeObjectURL(shot.url);
    onShot(new File([b], 'receipt.jpg', { type: 'image/jpeg' }));
  }

  return (
    <div className="rv-cam">
      {err ? (
        <div className="rv-cam-err">
          <p>{err}</p>
          <button className="rv-btn" onClick={() => { stop(); onFail(); }}>
            폰 카메라 앱으로 찍기
          </button>
          <button className="rv-btn-ghost" onClick={() => { stop(); onCancel(); }}>닫기</button>
        </div>
      ) : shot ? (
        <>
          <img className="rv-cam-view" src={shot.url} alt="" />
          <div className="rv-cam-bar">
            <button className="rv-cam-side" onClick={retake}>다시 찍기</button>
            <button className="rv-cam-ok" onClick={use}>이걸로 ✓</button>
          </div>
          <p className="rv-cam-hint">글씨가 읽히는지 보고 넘겨. 흐리면 다시 찍는 게 빨라.</p>
        </>
      ) : (
        <>
          <video className="rv-cam-view" ref={videoRef} playsInline muted autoPlay />
          <div className="rv-cam-bar">
            <button className="rv-cam-side" onClick={() => { stop(); onCancel(); }}>닫기</button>
            <button className="rv-cam-shutter" onClick={take} disabled={!ready || shooting}
                    aria-label="촬영" />
            <span className="rv-cam-side" />
          </div>
          <p className="rv-cam-hint">
            {ready ? '영수증 전체가 화면에 들어오게 맞춰줘. 길면 세로로.' : '카메라 켜는 중...'}
          </p>
        </>
      )}
    </div>
  );
}

function ReceiptForm({ initial, ledger, paymentRefs, merchants, session, onDone, onCancel }) {
  const ledgerId = ledger.id;
  const P = window.RV_KIND(ledger.kind);      // 장부 종류가 화면을 정한다
  const F = P.form;
  const editing = !!(initial && initial.id);

  // ---- 초안 보관 ----
  //
  // 안드로이드에서 카메라 앱이 뜨면 크롬이 메모리를 비우려고 이 화면을 통째로
  // 끝내버릴 때가 있다. 사진을 찍고 돌아오면 앱이 새로 뜨고, 쓰던 내용도
  // 방금 찍은 사진도 사라진다. 실제로 이 일이 났다 — "아무 일도 안 일어나"의 정체다.
  //
  // 그래서 입력 중인 내용을 계속 저장해 두고, 다시 뜨면 이어서 쓰게 한다.
  // (사진 자체는 브라우저가 들고 있던 것이라 되살릴 수 없다. 그건 아래 안내로 처리.)
  const DRAFT_KEY = 'rv_draft_' + ledger.id;
  const CAM_KEY = 'rv_camera_at';

  const [rec, setRec] = useState(() => {
    const base = Object.assign(
      {}, BLANK,
      // 장부마다 분류표가 다르니 처음 골라져 있는 값도 달라야 한다
      { category: window.RV_FIRST_CAT(ledger.kind, ledger.cat_set) },
      initial || {}
    );
    if (initial) return base;                    // 수정 중이면 초안을 끼얹지 않는다
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return base;
      const d = JSON.parse(raw);
      // 하루 지난 초안은 버린다. 오래된 걸 되살리면 오히려 헷갈린다.
      if (!d || !d.at || Date.now() - d.at > 86400000) return base;
      return Object.assign(base, d.rec || {});
    } catch (e) { return base; }
  });

  // 초안에서 되살아난 화면인지 (되살아났다면 그렇다고 말해줘야 한다)
  const [restored, setRestored] = useState(() => {
    if (initial) return false;
    try {
      const raw = localStorage.getItem('rv_draft_' + ledger.id);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || !d.at || Date.now() - d.at > 86400000) return false;
      const r = d.rec || {};
      // 뭔가 실제로 입력돼 있을 때만 "이어서 쓰는 중"이라고 한다
      return !!(r.merchant || r.amount_original || r.notes ||
                (r.splits && r.splits.length));
    } catch (e) { return false; }
  });

  // 사진은 여러 장이 될 수 있다. 손으로 쓴 명세가 두세 장이고 카드 전표가 따로
  // 붙는 거래가 실제로 있다 — 그때 한 장만 남기면 증빙이 반쪽이 된다.
  // 첫 장이 대표: AI가 읽는 것도, 목록·PDF에 나오는 것도 이 장이다.
  // [{ key, path?, url, blob? }]  path 가 있으면 이미 올라간 사진.
  const [photos, setPhotos] = useState([]);
  const [bigPhoto, setBigPhoto] = useState(null);   // 크게 보기
  const keySeq = useRef(0);
  const origPaths = useRef([]);                     // 열었을 때 붙어 있던 사진들
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  // 잘못된 게 아니라 그냥 알려주는 말 (붉은 오류 색으로 띄우면 안 된다)
  const [note, setNote] = useState('');
  // 카메라에서 돌아오는 사이 앱이 다시 시작됐을 때 보여줄 안내
  const [cameraLost, setCameraLost] = useState(false);
  const [camOpen, setCamOpen] = useState(false);   // 앱 안 카메라가 떠 있는지
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  // 입력 중인 내용을 계속 저장해 둔다. 글자는 localStorage, 사진은 IndexedDB.
  useEffect(() => {
    if (editing) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), rec: rec }));
    } catch (e) {}
  }, [rec, editing, DRAFT_KEY]);

  // 다른 앱으로 넘어가는 그 순간이 제일 위험하다. 안드로이드는 예고 없이
  // 우리 화면을 정리하고, React 의 effect 는 그때 안 돌 수도 있다.
  // 화면이 가려지는 즉시 손으로 한 번 더 써둔다.
  useEffect(() => {
    if (editing) return;
    const flush = () => {
      if (document.visibilityState !== 'hidden') return;
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), rec: rec }));
      } catch (e) {}
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [rec, editing, DRAFT_KEY]);

  // 붙여둔 사진도 남겨둔다. 사진은 메모리에만 있는 Blob 이라
  // 앱이 정리되면 그대로 사라진다 — 글자만 살아 돌아오면 소용이 없다.
  const [draftPhotosDone, setDraftPhotosDone] = useState(false);
  useEffect(() => {
    if (editing) { setDraftPhotosDone(true); return; }
    let alive = true;
    window.RV_DRAFT.get(DRAFT_KEY).then((blobs) => {
      if (!alive) return;
      if (blobs.length) {
        setPhotos((list) => list.concat(blobs.map((b, i) => ({
          key: 'draft' + i, blob: b, url: URL.createObjectURL(b),
        }))));
        setPhotosReady(true);
      }
      setDraftPhotosDone(true);
    });
    return () => { alive = false; };
  }, [editing, DRAFT_KEY]);

  // 사진 목록이 바뀔 때마다 갈아끼운다. 되살린 게 끝나기 전에 쓰면
  // 빈 목록으로 덮어써서 방금 되살린 사진을 지우게 된다.
  useEffect(() => {
    if (editing || !draftPhotosDone) return;
    window.RV_DRAFT.put(DRAFT_KEY, photos.filter((p) => p.blob).map((p) => p.blob));
  }, [photos, editing, draftPhotosDone, DRAFT_KEY]);

  // 화면이 새로 떴는데 조금 전에 카메라를 열었던 흔적이 있으면,
  // 사진을 찍고 오는 사이 앱이 종료된 것이다.
  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(CAM_KEY) || 0);
      if (at && Date.now() - at < 300000) setCameraLost(true);
      localStorage.removeItem(CAM_KEY);
    } catch (e) {}
  }, []);

  // 초안은 "새로 쓰던 영수증" 하나만 가리킨다. 수정 화면은 초안을 쓰지도,
  // 만들지도 않으므로 저장했다고 남의 초안을 지우면 안 된다 — 그러면
  // 쓰다 만 새 영수증이 통째로 날아간다.
  function clearDraft() {
    if (editing) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    window.RV_DRAFT.clear(DRAFT_KEY);
  }

  // 폰 카메라 앱으로 넘어가기 직전에 흔적을 남긴다.
  // 이제는 앱 안 카메라가 안 될 때만 여기로 온다.
  function openPhoneCamera() {
    try { localStorage.setItem(CAM_KEY, String(Date.now())); } catch (e) {}
    cameraRef.current.click();
  }

  // 앱 안 카메라로 찍은 사진은 파일 고르기와 똑같은 길로 보낸다
  async function shotTaken(file) {
    setCamOpen(false);
    await handleImage(file, 'photo', photos.length === 0, '');
  }

  // 수정하려고 연 영수증에 이미 붙어 있는 사진들을 불러온다.
  //
  // photosReady 가 핵심이다. 예전에는 origPaths 를 바로 채워놓고 photos 는 서명 URL이
  // 도착한 뒤에 채웠다. 그 사이에 저장을 누르면 "화면에 사진이 없다 = 사용자가 다 뺐다"
  // 로 읽혀서 저장소의 원본까지 지워졌다. 되돌릴 수 없는 사고였다.
  // 이제 목록이 실제로 로드되기 전에는 사진을 아예 건드리지 않는다.
  const [photosReady, setPhotosReady] = useState(false);
  const [photoErr, setPhotoErr] = useState('');

  useEffect(() => {
    let alive = true;
    const paths = DB.imagePaths(initial);
    if (!paths.length) { setPhotosReady(true); return; }
    origPaths.current = paths;
    Promise.all(paths.map((p) => DB.imageUrl(p))).then(
      (urls) => {
        if (!alive) return;
        setPhotos(paths.map((p, i) => ({ key: 'old' + i, path: p, url: urls[i] })));
        setPhotosReady(true);
      },
      () => {
        // URL을 못 받았다고 사진이 없어진 게 아니다. 준비 안 됨으로 두면
        // 저장할 때 사진 목록을 손대지 않고 그대로 지나간다.
        if (!alive) return;
        setPhotoErr('사진을 불러오지 못했어. 다른 건 고쳐서 저장해도 되고, ' +
                    '사진은 그대로 남아 있어.');
      }
    );
    return () => { alive = false; };
  }, [initial && initial.id]);

  function addPhoto(blob) {
    const p = { key: 'new' + (++keySeq.current), blob: blob, url: URL.createObjectURL(blob) };
    setPhotos((list) => list.concat([p]));
    return p;
  }
  function dropPhoto(i) {
    setPhotos((list) => {
      const gone = list[i];
      // 새로 찍은 사진은 브라우저 메모리를 붙잡고 있다. 놓아주지 않으면
      // 하루 입력하는 동안 수십 MB가 쌓이고, 그게 바로 안드로이드가
      // 앱을 죽이는 이유가 된다. 서버에서 온 사진(path)은 놓아줄 게 없다.
      if (gone && gone.blob && gone.url) { try { URL.revokeObjectURL(gone.url); } catch (e) {} }
      return list.filter((_, n) => n !== i);
    });
  }
  // 대표를 바꾼다 = 그 장을 맨 앞으로. 금액이 인쇄된 장을 대표로 두면 대조가 쉽다.
  function makeMain(i) {
    setPhotos((list) => [list[i]].concat(list.filter((_, n) => n !== i)));
  }

  // 이 장부의 첫 분류. 분할 줄의 기본값으로 쓴다 —
  // 예전에는 'supplies' 로 박혀 있었는데 그건 가죽 장부에만 있는 키라,
  // 집 리모델링 장부에서는 그 줄이 보고서 어느 칸에도 안 잡히고 조용히 사라졌다.
  const firstCat = window.RV_FIRST_CAT(ledger.kind, ledger.cat_set);

  // 화면을 떠날 때 아직 붙잡고 있는 사진 메모리를 전부 놓아준다
  const photosRef = useRef([]);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => {
    photosRef.current.forEach((p) => {
      if (p && p.blob && p.url) { try { URL.revokeObjectURL(p.url); } catch (e) {} }
    });
  }, []);

  function set(k, v) { setRec((r) => Object.assign({}, r, { [k]: v })); }

  // 가맹점 이름을 전에 쓴 것으로 맞추면 영문 표기도 따라온다.
  // 이미 적어 둔 영문은 건드리지 않는다 — 사람이 넣은 값이 이긴다.
  function pickMerchant(v) {
    const hit = (merchants || []).find((m) => m.name === v && m.en);
    setRec((r) => Object.assign({}, r, {
      merchant: v,
      merchant_en: (hit && !(r.merchant_en || '').trim()) ? hit.en : r.merchant_en,
    }));
  }

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
    // 수동 입력으로 넘어갔으면 남아 있던 '못 가져왔어' 와 '가져오는 중' 을 치운다.
    // 안 그러면 시킨 대로 했는데도 경고가 영영 안 사라진다.
    if (rec.fx_source === 'manual') { setFxErr(''); setFxBusy(false); return; }
    if (!rec.purchased_at) { setFxBusy(false); return; }

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

  // ---- 금액 하나만 빼기 ----
  //
  // 영수증에 개인 품목이 하나 섞였을 때 줄을 두 개 만들어 각각 분류와 금액을 넣는 건
  // 너무 번거롭다. 그럴 땐 "얼마를 빼면 되는지" 숫자 하나면 충분하다.
  // 여기서 받은 금액으로 분할 두 줄을 대신 만들어 준다 —
  // 뒤쪽 계산·문서·CSV 는 전부 기존 분할 구조를 그대로 쓴다.
  const [excluding, setExcluding] = useState(false);
  const [exclAmt, setExclAmt] = useState('');
  const [exclNote, setExclNote] = useState('');

  const exclRaw = U.parseAmount(exclAmt) || 0;
  const taxAmt = U.parseAmount(rec.tax) || 0;

  // 세금 처리는 나라마다 다르다.
  //   미국: 진열 가격은 세전이고 계산할 때 판매세가 붙는다 → 뺄 때 그 몫도 같이 빼야 한다.
  //   한국·일본·유럽: 가격에 부가세가 이미 들어 있다 → 적힌 가격 그대로 빼면 된다.
  // 계산대에서 세금이 더해지는 나라(미국·캐나다·멕시코)에서만 보정한다.
  // 한국·일본·유럽은 세금이 이미 가격표에 들어 있다.
  const cty = window.RV_COUNTRIES.find((c) => c.code === rec.country);
  const taxAdded = !!(cty && cty.taxAtRegister) && taxAmt > 0 && originalAmount > taxAmt;
  const exclWithTax = taxAdded
    ? exclRaw * (originalAmount / (originalAmount - taxAmt))
    : exclRaw;
  const zeroDecCur = rec.currency === 'KRW' || rec.currency === 'JPY';
  const exclFinal = zeroDecCur ? Math.round(exclWithTax) : Math.round(exclWithTax * 100) / 100;

  function applyExclude() {
    const P = window.RV_KIND(ledger.kind);
    const key = (P.exclude && P.exclude.cat) || 'other';
    const rest = originalAmount - exclFinal;
    setRec((r) => Object.assign({}, r, {
      splits: [
        { category: r.category, amount: zeroDecCur ? String(Math.round(rest)) : rest.toFixed(2),
          note: '' },
        { category: key, amount: String(exclFinal), note: exclNote || 'personal item' },
      ],
    }));
    setExcluding(false);
    setExclAmt(''); setExclNote('');
  }

  function startSplit() {
    setRec((r) => Object.assign({}, r, {
      splits: [
        { category: r.category, amount: r.amount_original || '', note: '' },
        { category: firstCat, amount: '', note: '' },
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
      splits: r.splits.concat([{ category: firstCat, amount: '', note: '' }]),
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
    const cur = U.parseAmount(splits[i].amount) || 0;
    const next = cur + remainder;
    // 원·엔에는 소수점이 없다. 2000.00 처럼 찍히면 영수증과 달라 보인다.
    const zeroDec = rec.currency === 'KRW' || rec.currency === 'JPY';
    setSplit(i, 'amount', zeroDec ? String(Math.round(next)) : next.toFixed(2));
  }

  // 갤러리에서는 여러 장을 한 번에 고를 수 있다. 영수증이 두세 장인 거래에서
  // 한 장씩 여섯 번 왕복하는 건 너무 번거롭다.
  async function pickImage(e, source) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    // 이 시점의 장수를 세어둔다. setPhotos 는 곧바로 반영되지 않아서
    // 반복문 안에서 photos.length 를 보면 전부 "첫 장" 으로 읽힌다.
    const had = photos.length;
    for (let i = 0; i < files.length; i++) {
      // 하나씩 차례로. 한꺼번에 돌리면 폰 메모리가 튀고,
      // 첫 장의 인식이 끝나기 전에 둘째 장이 끼어든다.
      await handleImage(files[i], source, had + i === 0,
                        files.length > 1 ? (i + 1) + '/' + files.length : '');
    }
  }

  // 사진 한 장이 들어왔을 때 하는 일. 앱 안 카메라도, 갤러리도 여기로 모인다.
  async function handleImage(file, source, first, ofN) {
    setErr(''); setNote('');
    setBusy(ofN ? '사진 ' + ofN + ' 정리하는 중...' : '이미지 정리하는 중...');
    setCameraLost(false);
    try { localStorage.removeItem(CAM_KEY); } catch (ex2) {}

    // 사진 준비와 AI 인식을 분리한다.
    // 예전에는 한 덩어리라서 인식이 실패하면 사진까지 같이 날아갔다 —
    // 사진은 증빙이라 인식이 안 되더라도 반드시 남아야 한다.
    let small;
    try {
      small = await U.compressImage(file);
      addPhoto(small);
      if (first) set('source', source);
    } catch (ex) {
      AI.trace('사진 처리 실패', { error: String(ex && ex.message || ex) });
      setBusy('');
      setErr('사진을 읽지 못했어 (' + (ex && ex.message) + '). 다시 찍어볼래?');
      return;
    }

    // 둘째 장부터는 증빙으로만 붙인다. 손글씨 명세 같은 건 AI에 보내봐야
    // 틀린 금액만 받게 되고, 하루 한도도 장수만큼 나간다.
    if (!first) {
      setBusy('');
      setNote(ofN
        ? '사진 ' + ofN + ' 붙였어. 금액은 대표(첫 장)에서만 읽어.'
        : '「증빙 ' + photos.length + '」로 붙였어. 금액은 대표(첫 장)에서만 읽어.');
      return;
    }

    if (!AI.available()) {
      setBusy('');
      setErr('자동 인식이 연결돼 있지 않아. 사진은 저장되니 항목만 직접 넣어줘.');
      return;
    }

    await runExtract(small, source);
  }

  // 사진 한 장을 AI에게 읽히고 결과를 화면에 채운다.
  // 사진 고르기와 분리해 둔 이유: 앱이 한 번 죽었다 살아난 뒤
  // 같은 사진으로 "다시 인식" 만 하고 싶을 때가 있다.
  async function runExtract(small, source) {
    setErr(''); setBusy('영수증 읽는 중...');
    // 인식은 몇 초 걸린다. 그 사이에 사람이 고친 칸은 AI가 덮어쓰면 안 된다 —
    // 눈앞에서 방금 친 글자가 사라지는 것만큼 나쁜 게 없다.
    // 그래서 시작할 때의 값을 찍어두고, 돌아왔을 때 그대로인 칸만 채운다.
    const before = rec;
    const keep = (r, k, next) => (r[k] !== before[k] ? r[k] : next);
    try {
      const got = await AI.extract(small, ledgerId, ledger);

      // AI가 제안한 분할은 그대로 믿지 않는다.
      // 분류 key 가 실제로 있고, 합계가 총액과 맞을 때만 받아들인다.
      let aiSplits = [];
      if (Array.isArray(got.splits) && got.splits.length > 1 && got.amount != null) {
        // 이 장부의 분류만 받는다. 전체 분류표로 확인하면 다른 장부의 키가
        // 섞여 들어와 그 줄이 보고서에서 통째로 빠진다.
        const ok = {};
        window.RV_CATS(ledger).forEach((c) => { ok[c.key] = 1; });
        const clean = got.splits.filter(
          (x) => x && ok[x.category] && Number(x.amount) > 0);
        if (clean.length > 1 && U.splitRemainder(got.amount, clean) === 0) {
          aiSplits = clean.map((x) => ({
            category: x.category,
            amount: String(Number(x.amount).toFixed(2)),
            note: x.note || '',
          }));
        }
      }

      const cur = (window.RV_CURRENCIES || []).includes(got.currency) ? got.currency : null;
      const ctry = window.RV_COUNTRIES.some((c) => c.code === got.country) ? got.country : null;

      // AI가 준 분류 key 가 이 장부의 분류표에 실제로 있는지 본다.
      // RV_CAT_BY_KEY 는 모든 장부의 분류를 합쳐놓은 표라, 그것만 보면
      // 집 리모델링 분류가 공방 장부에 들어올 수 있다. 그러면 그 금액은
      // 보고서 어느 칸에도 안 잡히고 조용히 사라진다.
      const mine = window.RV_CATS(ledger).some((c) => c.key === got.category);

      setRec((r) => Object.assign({}, r, {
        splits: aiSplits.length ? aiSplits : r.splits,
        purchased_at: keep(r, 'purchased_at', got.purchased_at || r.purchased_at),
        merchant: keep(r, 'merchant', got.merchant || r.merchant),
        merchant_en: keep(r, 'merchant_en', got.merchant_en || r.merchant_en || ''),
        notes_en: keep(r, 'notes_en', got.notes_en || r.notes_en || ''),
        notes: keep(r, 'notes', r.notes || got.notes_en || ''),
        country: keep(r, 'country', ctry || r.country),
        currency: keep(r, 'currency', cur || r.currency),
        // 통화가 바뀌었으니 환율은 다시 받아오게 표시해 둔다
        fx_source: cur && cur !== 'USD' ? 'ecb' : 'same',
        amount_original: keep(r, 'amount_original',
          got.amount != null ? String(got.amount) : r.amount_original),
        tax: keep(r, 'tax', got.tax != null ? String(got.tax) : r.tax),
        payment_method: keep(r, 'payment_method', got.payment_method || r.payment_method),
        // 어느 카드였는지. 명세서와 대조할 때 쓰는 값이라 자동으로 채우고,
        // 틀리면 손으로 고칠 수 있게 그냥 글자로 둔다.
        payment_ref: keep(r, 'payment_ref',
          U.cleanPaymentRef(got.payment_ref) || r.payment_ref || ''),
        category: keep(r, 'category', mine ? got.category : r.category),
        ai_raw: got,
        needs_review: true,
        source: source || r.source,
      }));
    } catch (ex) {
      // 사진은 이미 붙어 있다. 인식만 실패한 것이니 그렇게 말한다.
      setErr('자동 인식 실패: ' + (ex.message || '알 수 없는 오류') +
             ' — 사진은 그대로 있어. 항목만 직접 넣고 저장하면 돼. ' +
             '(설정 → 연결 상태에 자세한 내용이 남아 있어)');
    } finally {
      setBusy('');
    }
  }

  // 대표 사진을 다시 읽힌다. 이미 저장된 영수증이면 사진이 손에 없으니 받아온다.
  async function redoExtract() {
    const main = photos[0];
    if (!main) return;
    setRec((r) => Object.assign({}, r, { ai_raw: null }));
    let b = main.blob;
    if (!b) {
      setBusy('사진 가져오는 중...');
      try {
        b = await (await fetch(main.url)).blob();
      } catch (ex) {
        setBusy('');
        return setErr('사진을 가져오지 못했어. 잠깐 뒤에 다시 눌러줄래?');
      }
    }
    await runExtract(b, rec.source);
  }

  async function save() {
    if (!rec.purchased_at) return setErr('거래일을 넣어줘.');

    if (!isFinite(originalAmount) || originalAmount <= 0) {
      return setErr('금액을 넣어줘. 숫자만 있으면 돼.');
    }
    if (foreign && !(Number(rec.fx_rate) > 0)) {
      return setErr('환율을 못 가져왔어. 달러 금액을 직접 넣어주면 저장돼.');
    }
    // 환율 1은 "1원 = 1달러" 다. 외화 영수증에서 이 값이 저장되면
    // ₩1,200,000 이 $1,200,000 으로 신고에 들어간다. 처음 값이 1이라
    // 조회가 실패했거나 아직 안 끝났을 때 그대로 통과하고 있었다.
    if (foreign && Number(rec.fx_rate) === 1 && rec.fx_source !== 'manual') {
      return setErr(
        '아직 환율이 안 잡혔어 (1 ' + rec.currency + ' = 1 USD 로 되어 있어). ' +
        '잠깐 기다렸다 다시 누르거나, 카드에 청구된 달러 금액을 직접 넣어줘.');
    }
    if (foreign && fxBusy) {
      return setErr('환율 가져오는 중이야. 잠깐만 기다렸다 저장해줘.');
    }

    if (splitting && splits.some((x) => !(U.parseAmount(x.amount) > 0))) {
      return setErr('분할한 줄 중에 금액이 빈 게 있어. 금액을 넣거나 그 줄을 지워줘.');
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

      // 사진 목록을 아직 못 읽었으면 손대지 않는다. "화면에 없다" 와
      // "아직 안 떴다" 를 구분하지 못하면 남의 증빙을 지우게 된다.
      if (photosReady && (photos.length || origPaths.current.length)) {
        setBusy(photos.length > 1 ? '사진 ' + photos.length + '장 올리는 중...' : '사진 올리는 중...');
        try {
          await DB.saveImages(ledgerId, saved.id, photos, origPaths.current);
        } catch (imgEx) {
          // 영수증 자체는 이미 저장됐다. 사진만 실패한 걸로 전체를 되돌리면
          // 방금 입력한 내용을 다시 치게 만드는 셈이라 더 나쁘다.
          // 다만 rec.id 를 채워둔다 — 안 그러면 다시 누를 때 새 영수증이 하나 더 생긴다.
          setRec((r) => Object.assign({}, r, { id: saved.id }));
          clearDraft();
          setBusy('');
          setErr('영수증은 저장됐는데 사진만 못 올렸어: ' +
                 (imgEx.message || '알 수 없는 오류') +
                 ' — 다시 저장을 누르면 사진만 다시 올려. 같은 영수증에 붙어.');
          return;
        }
      }
      clearDraft();
      onDone(saved);
    } catch (ex) {
      setErr(ex.message || '저장하지 못했어요.');
      setBusy('');
    }
  }

  // 거래일이 말이 되는지 본다.
  //
  // 한국 영수증은 연도를 두 자리로 찍는다 — "26/08/18" 은 2026년 8월 18일이다.
  // AI가 이걸 2014년으로 읽은 적이 있고, 그러면 조용히 세 가지가 한꺼번에 틀린다:
  // 그 해의 환율로 환산되고, 그 해로 저장되고, 목록의 연도 칸에 없어서 사라진다.
  // 막을 수는 없어도 눈에 띄게는 할 수 있다.
  const dateWarn = useMemo(() => {
    if (!rec.purchased_at) return '';
    var d = new Date(rec.purchased_at + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var days = Math.round((today - d) / 86400000);
    if (days < -1) {
      return '거래일이 미래야 (' + rec.purchased_at + '). 영수증을 다시 봐줘.';
    }
    if (days > 550) {
      return '거래일이 ' + d.getFullYear() + '년으로 잡혀 있어 — 오늘과 ' +
             (days > 700 ? Math.round(days / 365) + '년쯤' : '1년 넘게') + ' 차이 나. ' +
             '한국 영수증은 연도를 두 자리로 찍어서(26/08/18 = 2026년) AI가 잘못 읽을 때가 있어. ' +
             '연도가 틀리면 환율도 그 해 것으로 계산되니까 꼭 확인해줘.';
    }
    return '';
  }, [rec.purchased_at]);

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
  // 절반만 인정되는 분류(식비)가 있을 때만 안내한다.
  // 0% 분류(개인 용품)까지 걸리면 엉뚱하게 "식비는 50%" 가 뜬다.
  const halfOnly = U.lines(calcBase).some((l) => l.cat.deduct > 0 && l.cat.deduct < 1);

  // 카메라가 떠 있는 동안은 카메라만 보여준다.
  // (폼을 지우는 게 아니라 잠깐 가리는 것 — 쓰던 내용은 그대로 살아 있다.)
  if (camOpen) {
    return (
      <InAppCamera
        onShot={shotTaken}
        onCancel={() => setCamOpen(false)}
        onFail={() => { setCamOpen(false); openPhoneCamera(); }}
      />
    );
  }

  return (
    <div className="rv-screen">
      <div className="rv-topbar">
        {/* 취소하면 초안도 버린다. 안 그러면 그만둔 영수증의 가맹점·목적이
            다음에 새로 쓰는 영수증에 되살아나 붙는다 — 24시간 동안. */}
        <button className="rv-btn-ghost"
                onClick={() => { clearDraft(); onCancel(); }}><L k="cancel" /></button>
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
      {(busy || err || note) && (
        <div className={'rv-fixed-note ' +
             (err ? 'rv-fixed-err' : note && !busy ? 'rv-fixed-info' : 'rv-fixed-busy')}>
          <div>{err || busy || note}</div>
          {err && <button className="rv-banner-x" onClick={() => setErr('')}>✕</button>}
          {!err && !busy && note &&
            <button className="rv-banner-x" onClick={() => setNote('')}>✕</button>}
        </div>
      )}

      <div className="rv-body">
        {/* 카메라에 다녀오는 사이 앱이 다시 시작된 경우.
            사진은 이미 폰 갤러리에 저장돼 있으니 그쪽으로 안내한다. */}
        {cameraLost && !photos.length && (
          <Banner kind="warn" onClose={() => setCameraLost(false)}>
            사진을 찍고 돌아오는 사이 앱이 다시 시작됐어. 안드로이드가 카메라를 띄우면서
            앱을 잠깐 종료해버린 거야 — 사진은 <strong>폰 갤러리에 그대로 저장돼 있어.</strong>
            위의 <strong>🖼 스크린샷 · 갤러리</strong>로 방금 찍은 사진을 골라줘. 그게 더 확실해.
            {' '}쓰던 내용은 그대로 남아 있어.
          </Banner>
        )}

        {(restored || (draftPhotosDone && !editing && photos.some((p) => p.blob) && !rec.id)) && (
          <Banner kind="info" onClose={() => setRestored(false)}>
            쓰다 만 내용을 이어서 불러왔어
            {photos.filter((p) => p.blob).length > 0 &&
              ' (사진 ' + photos.filter((p) => p.blob).length + '장 포함)'}.
            {' '}
            <button className="rv-linkbtn" onClick={() => {
              clearDraft();
              setRestored(false);
              // 사진도 같이 버린다. 글자만 비우면 남의 영수증 사진이 붙어 있게 된다.
              photos.forEach((p) => {
                if (p.blob && p.url) { try { URL.revokeObjectURL(p.url); } catch (e) {} }
              });
              setPhotos([]);
              setRec(Object.assign({}, BLANK,
                { category: window.RV_FIRST_CAT(ledger.kind, ledger.cat_set) }));
            }}>새로 시작</button>
          </Banner>
        )}

        {rec.needs_review && (
          <Banner kind="warn">
            AI가 채운 값이야. 금액과 날짜만 눈으로 확인하고 저장해줘.
          </Banner>
        )}

        <div className="rv-photo-row">
          {/* 인식이 도는 중에 또 찍으면 결과 두 개가 서로를 덮어쓴다 */}
          <button className="rv-btn-ghost rv-grow" disabled={!!busy}
                  onClick={() => { setErr(''); setCamOpen(true); }}>
            📷 {photos.length ? '사진 더 찍기' : <L k="takePhoto" />}
          </button>
          <button className="rv-btn-ghost rv-grow" disabled={!!busy}
                  onClick={() => fileRef.current.click()}>
            🖼 <L k="fromGallery" />
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment"
               hidden onChange={(e) => pickImage(e, 'photo')} />
        <input ref={fileRef} type="file" accept="image/*" multiple
               hidden onChange={(e) => pickImage(e, 'screenshot')} />
        {rec.ai_raw && photos.length > 0 && (
          <button className="rv-btn-ghost rv-wide-sm" disabled={!!busy}
                  onClick={redoExtract}>
            🔄 대표 사진 다시 인식
          </button>
        )}
        <p className="rv-muted rv-small">
          촬영은 앱 안에서 바로 돼. 갤러리에서는 <strong>여러 장을 한 번에</strong> 고를 수 있어.
          <strong> 한 거래에 종이가 여러 장이면 다 붙여</strong> — 손으로 쓴 명세 여러 장에
          카드 전표가 따로 붙는 거래가 그렇다. <strong>금액이 인쇄된 장을 대표로</strong> 두면
          되고, 나머지는 증빙으로 그대로 남아. AI는 대표 한 장만 읽어.
          {' '}쓰던 내용과 붙인 사진은 저장 전에 다른 앱에 다녀와도 남아 있어.
        </p>

        {!AI.available() && (
          <p className="rv-muted rv-small">
            자동 인식은 아직 연결 전이야. 사진은 증빙으로 저장되고, 항목은 아래에 직접 넣으면 돼.
          </p>
        )}

        {photos.length > 0 && (
          <>
            <div className="rv-photos">
              {photos.map((p, i) => (
                <div key={p.key} className={'rv-photo' + (i === 0 ? ' rv-photo-main' : '')}>
                  <img src={p.url} alt={i === 0 ? '대표 사진' : '증빙 사진 ' + i}
                       onClick={() => setBigPhoto(p)} />
                  <span className="rv-photo-tag">{i === 0 ? '대표 · 정산' : '증빙 ' + i}</span>
                  <div className="rv-photo-acts">
                    {i > 0 && (
                      <button className="rv-photo-btn" onClick={() => makeMain(i)}>대표로</button>
                    )}
                    <button className="rv-photo-btn" onClick={() => dropPhoto(i)}>빼기</button>
                  </div>
                </div>
              ))}
            </div>
            <p className="rv-muted rv-small">
              {photos.length === 1
                ? '사진을 누르면 크게 볼 수 있어. 종이가 더 있으면 계속 붙여도 돼.'
                : '사진 ' + photos.length + '장이 이 영수증 하나에 같이 저장돼. ' +
                  '순서를 바꾸려면 「대표로」를 눌러 — 맨 앞 장이 세무사가 먼저 보는 장이야.'}
            </p>
          </>
        )}

        {bigPhoto && (
          <div className="rv-lightbox" onClick={() => setBigPhoto(null)}>
            <img src={bigPhoto.url} alt="영수증" />
            <button className="rv-lightbox-x" onClick={() => setBigPhoto(null)}>닫기 ✕</button>
          </div>
        )}

        <label className="rv-label"><L k="date" />
          <input className="rv-input" type="date" value={rec.purchased_at}
                 onChange={(e) => set('purchased_at', e.target.value)} />
        </label>
        <p className="rv-muted rv-small">영수증에 찍힌 거래일이야. 목록도 이 날짜순으로 정렬돼.</p>
        {dateWarn && <Banner kind="warn">{dateWarn}</Banner>}

        <div className="rv-row">
          <label className="rv-label rv-grow"><L k="merchant" />
            {/* 같은 가게에서 계속 산다. 전에 넣은 이름을 골라 쓸 수 있게 —
                AI가 이름을 엉뚱하게 읽었을 때 고쳐 넣는 게 이 칸의 주된 일이다. */}
            <input className="rv-input" type="text" placeholder="Tandy Leather"
                   list="rv-merchants" value={rec.merchant}
                   onChange={(e) => pickMerchant(e.target.value)} />
            <datalist id="rv-merchants">
              {(merchants || []).map((m) => <option key={m.name} value={m.name} />)}
            </datalist>
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
            {/* 두 가지 길을 준다.
                빼야 할 게 하나면 금액 하나만 — 그게 대부분이다.
                분류가 정말 여럿으로 갈리면 그때만 줄을 나눈다. */}
            {!excluding && (
              <div className="rv-row rv-two-btn">
                <button className="rv-btn-ghost rv-grow" onClick={() => setExcluding(true)}>
                  − {P.exclude ? P.exclude.button : '일부 금액 빼기'}
                </button>
                <button className="rv-btn-ghost rv-grow" onClick={startSplit}>
                  ⑂ 분류 나누기
                </button>
              </div>
            )}

            {excluding && (
              <div className="rv-exclude">
                <div className="rv-exclude-head">{P.exclude.title}</div>
                <p className="rv-muted rv-small">{P.exclude.help}</p>

                <label className="rv-label">
                  뺄 금액 <span className="rv-cur-tag">{rec.currency || 'USD'}</span>
                  <input className="rv-input" type="number" inputMode="decimal"
                         step={zeroDecCur ? '1' : '0.01'}
                         placeholder={zeroDecCur ? '2000' : '10.00'}
                         value={exclAmt} onChange={(e) => setExclAmt(e.target.value)} />
                </label>
                <label className="rv-label">무엇인지 (영문으로 쓰면 문서에 그대로 나가)
                  <input className="rv-input" placeholder="예: toilet seat — personal"
                         value={exclNote} onChange={(e) => setExclNote(e.target.value)} />
                </label>

                {exclRaw > 0 && (
                  <div className="rv-exclude-calc">
                    {taxAdded ? (
                      <>
                        <div>
                          품목 {U.inCurrency(exclRaw, rec.currency)} + 판매세 몫{' '}
                          {U.inCurrency(exclFinal - exclRaw, rec.currency)} ={' '}
                          <strong>{U.inCurrency(exclFinal, rec.currency)}</strong> 이 빠져
                        </div>
                        <div className="rv-muted rv-small">
                          미국 영수증은 가격에 판매세가 따로 붙으니까, 뺄 때도 그 품목 몫의
                          세금을 같이 뺐어.
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <strong>{U.inCurrency(exclFinal, rec.currency)}</strong> 이 공제에서 빠져
                        </div>
                        <div className="rv-muted rv-small">
                          이 나라 영수증은 가격에 세금이 이미 들어 있어서 적힌 값 그대로 빼면 돼.
                        </div>
                      </>
                    )}
                    <div className="rv-muted rv-small">
                      영수증 총액 {U.inCurrency(originalAmount, rec.currency)} 은 그대로 남고,
                      남은 {U.inCurrency(originalAmount - exclFinal, rec.currency)} 만{' '}
                      {P.counted.ko}에 잡혀.
                    </div>
                  </div>
                )}

                <div className="rv-row rv-two-btn">
                  <button className="rv-btn-ghost rv-grow"
                          onClick={() => { setExcluding(false); setExclAmt(''); setExclNote(''); }}>
                    취소
                  </button>
                  <button className="rv-btn-sm rv-grow" onClick={applyExclude}
                          disabled={!(exclFinal > 0 && exclFinal < originalAmount)}>
                    적용
                  </button>
                </div>
                {!(originalAmount > 0) && (
                  <p className="rv-warn-text rv-small">먼저 위에 영수증 총액을 넣어줘.</p>
                )}
              </div>
            )}

            <p className="rv-muted rv-small">
              개인 물건이 하나 섞였을 땐 <strong>금액 하나만</strong> 빼면 돼.
              가죽과 공구처럼 <strong>사업용끼리 분류가 갈릴 때만</strong> 줄을 나누면 돼.
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

            {/* 줄마다 번호를 달고 칸마다 이름표를 붙인다.
                예전엔 분류 상자와 숫자 상자만 나란히 있어서 두 줄이 똑같이 보였고,
                어느 게 무슨 칸인지 알 수가 없었다. */}
            {splits.map((s, i) => {
              const sc = window.RV_CAT(s.category);
              const amt = U.parseAmount(s.amount);
              const empty = !(amt > 0);
              return (
                <div key={i} className={'rv-split-row' + (empty ? ' rv-split-empty' : '')}>
                  <div className="rv-split-head">
                    <span className="rv-split-n">{i + 1}</span>
                    {/* "1번째 항목" 은 아무 뜻이 없다. 무엇으로 잡혔는지를 보여준다. */}
                    <span className="rv-split-title">
                      {s.note || sc.ko}
                      <span className="rv-split-en">
                        {sc.en}{sc.deduct === 0 ? ' · 공제에서 빠짐' : ''}
                      </span>
                    </span>
                    <button className="rv-split-x" onClick={() => removeSplit(i)}
                            title="이 줄 지우기">✕ 지우기</button>
                  </div>

                  <label className="rv-label"><L k="category" />
                    <CategorySelect value={s.category} ledger={ledger}
                                    onChange={(v) => setSplit(i, 'category', v)} />
                  </label>

                  <label className="rv-label">
                    <L k="amount" /> <span className="rv-cur-tag">{rec.currency || 'USD'}</span>
                    <div className="rv-split-bottom">
                      <input className="rv-input" type="number" inputMode="decimal" step="0.01"
                             placeholder={(rec.currency === 'KRW' || rec.currency === 'JPY')
                                          ? '0' : '0.00'}
                             value={s.amount}
                             onChange={(e) => setSplit(i, 'amount', e.target.value)} />
                      {remainder !== 0 && (
                        <button className="rv-btn-ghost rv-split-fill" onClick={() => fillRemainder(i)}>
                          {remainder > 0
                            ? U.inCurrency(remainder, rec.currency) + ' 넣기'
                            : '남는 만큼 빼기'}
                        </button>
                      )}
                    </div>
                  </label>

                  {/* 무슨 품목이었는지. 세무사 CSV 에 그대로 나가고,
                      개인 항목을 왜 뺐는지 나중에 설명해주는 게 이 한 줄이다. */}
                  <label className="rv-label">이 줄이 무엇인지 (영문으로 쓰면 그대로 나가)
                    <input className="rv-input" value={s.note || ''}
                           placeholder={sc.deduct === 0 ? '예: toilet seat — personal'
                                                        : '예: tool box, clips'}
                           onChange={(e) => setSplit(i, 'note', e.target.value)} />
                  </label>

                  <p className="rv-muted rv-small">
                    {sc.line ? 'Schedule C ' + sc.line + '번 · ' : ''}{sc.en}
                    {amt > 0 && ' · ' + U.money(amt * (Number(rec.fx_rate) || 1))}
                    {sc.deduct === 0 && ' · 공제에는 안 들어가'}
                  </p>
                  {empty && (
                    <p className="rv-warn-text rv-small">금액을 넣거나 이 줄을 지워줘.</p>
                  )}
                </div>
              );
            })}

            <button className="rv-btn-ghost rv-wide-sm" onClick={addSplit}>+ <L k="addLine" /></button>
            <p className="rv-muted rv-small">
              줄들의 합이 총액 <strong>{U.inCurrency(originalAmount, rec.currency)}</strong> 과
              맞아야 저장돼. 금액은 <strong>영수증에 찍힌 통화</strong> 그대로 —
              달러 환산은 자동이야. 줄을 하나만 남기고 지우면 분할이 풀려.
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
                      {r.image_path && (
                        <span className="rv-clip" title="사진 있음">
                          📎{(r.extra_paths || []).length ? (r.extra_paths.length + 1) : ''}
                        </span>
                      )}
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

function Report({ rows, year, ledger, onTaxDoc, onOpen }) {
  const s = useMemo(() => U.summarize(rows), [rows]);
  const P = window.RV_KIND(ledger.kind);

  // 보는 방식 두 가지.
  //   line — 신고서 줄번호 순. 세무사와 같은 순서라 기본값.
  //   big  — 금액 큰 순. 분류도 큰 것부터 서고, 그 안의 영수증도 펼쳐서 큰 것부터.
  //
  // 예전엔 "항목 큰 순" 과 "지출 큰 순" 을 따로 뒀는데, 실제로 쓰는 분류는
  // 두세 개뿐이라 분류를 줄 세우는 것 자체는 뜻이 없었다. 궁금한 건 늘
  // "그 안에서 어느 지출이 컸나" 라서 하나로 합쳤다.
  const [view, setView] = useState('line');

  // 신고서 순으로 볼 때는 분류를 눌러야 펼쳐진다. 큰 순에서는 전부 펼쳐진다.
  const [openCat, setOpenCat] = useState(null);

  // 분류별 영수증 목록. 분할된 영수증은 그 분류에 해당하는 줄만 잡힌다.
  const byCat = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      U.lines(r).forEach((l) => {
        (m[l.category] = m[l.category] || []).push({
          rec: r, usd: l.usd, deduct: l.deductible, note: l.note, amount: l.amount,
        });
      });
    });
    Object.keys(m).forEach((k) => m[k].sort((a, b) => b.usd - a.usd));
    return m;
  }, [rows]);

  function ReceiptRow({ rec, usd, deduct, note }) {
    return (
      <button className="rv-mini" onClick={() => onOpen && onOpen(rec)}>
        <div className="rv-mini-main">
          <div className="rv-mini-title">
            {rec.merchant || '(가맹점 없음)'}
            {rec.country && rec.country !== 'US' && <CountryTag code={rec.country} />}
          </div>
          <div className="rv-muted rv-small">
            {U.prettyDate(rec.purchased_at)}
            {note ? ' · ' + note : ''}
            {U.isForeign(rec) ? ' · ' + U.inCurrency(rec.amount_original, rec.currency) : ''}
          </div>
        </div>
        <div className="rv-num">
          {U.money(usd)}
          {Math.abs(usd - deduct) > 0.005 && (
            <div className="rv-muted rv-small">{P.counted.ko} {U.money(deduct)}</div>
          )}
        </div>
      </button>
    );
  }

  function Section({ group, title, note, items, gross }) {
    if (items.length === 0) return null;
    // 합계에 안 잡히는 칸(수리·가구 등)은 합계도 "쓴 돈"으로 보여준다.
    // 반영액으로 보여주면 늘 0이라 무슨 뜻인지 알 수가 없다.
    // gross 칸도 달러로 더한다. e.gross 는 영수증 통화(원·엔이 섞일 수 있어) 라
    // 그대로 합치면 원화와 달러를 더하는 셈이 된다. 실제로 그 버그를 냈다.
    const val = (e) => (gross ? e.usd : e.deduct);
    const total = items.reduce((t, e) => t + val(e), 0);
    const shown = view === 'big'
      ? items.slice().sort((a, b) => val(b) - val(a))
      : items;

    return (
      /* data-group 으로 칸마다 색이 갈린다 — 목록 화면의 분류 알약과 같은 색이라
         두 화면을 오갈 때 눈이 헷갈리지 않는다. */
      <div className="rv-report-sec" data-group={group}>
        <div className="rv-report-head">
          <span className="rv-report-title">{title}</span>
          <strong>{U.money(total)}</strong>
        </div>
        {/* "줄번호 순으로 정렬돼 있어" 같은 설명은 그렇게 정렬돼 있을 때만 맞다 */}
        {note && view === 'line' && <p className="rv-muted rv-small">{note}</p>}
        <table className="rv-table">
          <tbody>
            {shown.map((e) => {
              const share = total > 0 ? Math.max(1, (val(e) / total) * 100) : 0;
              // 큰 순에서는 굳이 누르지 않아도 안이 보여야 한다 — 그게 이 화면의 목적이다.
              const open = view === 'big' || openCat === e.cat.key;
              return (
                <React.Fragment key={e.cat.key}>
                  <tr className="rv-cat-row"
                      onClick={() => setOpenCat(open ? null : e.cat.key)}>
                    {P.lineLabel && <td className="rv-line">{e.cat.line}</td>}
                    <td>
                      <div>
                        {e.cat.ko}
                        {view === 'line' && (
                          <span className="rv-caret">{open ? '▾' : '▸'}</span>
                        )}
                      </div>
                      <div className="rv-muted rv-small">{e.cat.en} · {e.n}건</div>
                      {/* 비중 막대. 숫자를 읽기 전에 어디가 큰지 먼저 보이게. */}
                      <div className="rv-share"><span style={{ width: share + '%' }} /></div>
                    </td>
                    <td className="rv-num">
                      {U.money(val(e))}
                      {!gross && Math.abs(e.deduct - e.usd) > 0.005 && (
                        <div className="rv-muted rv-small">지출 {U.money(e.usd)}</div>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={P.lineLabel ? 3 : 2} className="rv-cat-open">
                        {(byCat[e.cat.key] || []).map((x, i) => (
                          <ReceiptRow key={i} rec={x.rec} usd={x.usd}
                                      deduct={gross ? x.usd : x.deduct} note={x.note} />
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
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

        {rows.length > 0 && (
          <div className="rv-seg">
            <button className={view === 'line' ? 'on' : ''} onClick={() => setView('line')}>
              {P.lineLabel ? '신고서 순' : '기본 순'}
            </button>
            <button className={view === 'big' ? 'on' : ''} onClick={() => setView('big')}>
              큰 지출부터
            </button>
          </div>
        )}

        {/* 분류별 — 어떤 칸이 몇 개 나오는지는 장부 종류가 정한다 */}
        {P.report.sections.map((sec) => (
          <Section key={sec.group} group={sec.group} title={sec.title} note={sec.note}
                   gross={!!sec.gross} items={s.group(sec.group)} />
        ))}

        {rows.length > 0 && (
          <p className="rv-muted rv-small">
            {view === 'line'
              ? '분류를 누르면 그 안에 어떤 영수증이 있는지 큰 순서로 펼쳐져.'
              : '분류도, 그 안의 영수증도 큰 것부터야. 영수증을 누르면 바로 열려.'}
          </p>
        )}

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
    return sec.gross ? items.reduce((t, e) => t + e.usd, 0) : U.sum(items);
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
            // 종이가 여러 장인 거래는 몇 장인지 적어준다 — 세무사가 첨부를 셀 수 있게
            r.image_path
              ? ((r.extra_paths || []).length
                  ? 'on file (' + ((r.extra_paths.length) + 1) + ' images)' : 'on file')
              : '',
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
        <td className="tx-num">{U.plain(gross ? e.usd : e.deduct)}</td>
      </tr>
    ));
  }

  // 문서 맨 아래 주석. 어떤 줄을 넣을지는 장부 종류가 고른다(D.notes).
  function note(key) {
    switch (key) {
      case 'grandCaveat':
        return <li key={key}><strong>Read the total with care.</strong> The figure at the foot of
            this page is what was spent and recorded — it is <strong>not</strong> the Schedule C
            deduction. Purchases still need an inventory adjustment (Part III), line 13 runs
            through Form 4562, and line 9 depends on the mileage-vs-actual election.
            Each is noted below.</li>;
      case 'inventory':
        return <li key={key}><strong>Inventory is not tracked.</strong> Part III lines 35, 37, 39
            and 41 (beginning inventory, cost of labor, other costs, ending inventory) are not
            recorded in this system, so line 42 cannot be computed from this page alone.
            The purchases figure above is materials bought during the year, whether or not they
            were used.</li>;
      case 'startup':
        return <li key={key}><strong>Business start date:</strong> the owner's business
            registration was still in progress during part of this period. Costs paid before the
            business was actively operating may be start-up costs under §195 rather than current
            expenses. Please confirm the date the business began.</li>;
      case 'aiReviewed': {
        const un = rows.filter((r) => r.needs_review).length;
        return <li key={key}>Categories were suggested automatically from receipt images and
            confirmed by the taxpayer at entry.{un
              ? <> <strong>{un} receipt{un > 1 ? 's are' : ' is'} still marked unreviewed</strong> —
                flagged in the CSV.</> : null}</li>;
      }
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
      case 'excluded': {
        const ex = s.group('excluded');
        if (!ex.length) return null;
        const n = ex.reduce((t, e) => t + e.n, 0);
        return <li key={key}>{n} line item{n > 1 ? 's were' : ' was'} identified as personal and
            <strong> excluded from the deduction</strong>. The receipts are recorded at their full
            amounts so they reconcile to the card statement; only the business portion is claimed.</li>;
      }
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
                // 참석자 칸이 따로 없다. "기록돼 있다" 고 단언하면 없는 증빙을
                // 있다고 말하는 셈이라, 있는 그대로 적는다.
                <li><strong>Meals substantiation:</strong> Pub. 463 requires the business
                    relationship — names and occupations of those present. This system records a
                    free-text business purpose only; please confirm attendees are named there
                    before claiming.</li>
              )}
              <li>Category assignments were made by the {D.reviewedBy} at entry and should be
                  reviewed before {D.reviewedBefore}.</li>
            </ul>
          </section>

          <footer className="tx-foot">
            {/* 화면에는 안내가 있었지만 정작 밖으로 나가는 종이에는 없었다.
                남는 건 이 PDF 다. */}
            <p className="tx-disc">
              Taxpayer-prepared summary from receipt records. Not tax advice and not a
              return. Figures are as recorded by the taxpayer and should be verified against
              source documents before filing. Receipt images are retained and available on request.
            </p>
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
  const [urls, setUrls] = useState([]);
  const [big, setBig] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const c = window.RV_CAT(rec.category);
  const P = window.RV_KIND(ledger.kind);
  // 신고서 줄번호가 있는 장부면 줄번호를, 없으면 합계에 잡히는지를 보여준다.
  // 줄번호가 없는 분류(개인 용품 등)에 "Schedule C 번" 이 찍히면 안 된다.
  const catLine = (cc) => (
    (P.lineLabel && cc.line ? P.lineLabel + ' ' + cc.line + '번 · ' : '') +
    (cc.deduct === 0 ? '공제에서 빠짐 · ' : '') + cc.en);

  // 붙어 있는 사진 전부. 대표가 먼저다.
  useEffect(() => {
    let alive = true;
    const paths = DB.imagePaths(rec);
    if (!paths.length) { setUrls([]); return; }
    Promise.all(paths.map((p) => DB.imageUrl(p))).then((got) => {
      // 못 받은 장을 걸러내면 뒤의 사진이 앞으로 당겨져서
      // '증빙 1' 이 '대표 · 정산' 으로 둔갑한다. 자리는 그대로 두고 비워둔다.
      if (alive) setUrls(got);
    });
    return () => { alive = false; };
  }, [rec.id, rec.image_path, (rec.extra_paths || []).join('|')]);

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
            {/* 분할 금액은 영수증에 찍힌 통화 기준이다.
                여기에 달러 기호를 붙이면 ₩6,000 이 $6,000 으로 보인다. 실제로 그랬다. */}
            {U.lines(rec).map((l, i) => (
              <div key={i} className="rv-split-line">
                <div>
                  <div>{l.cat.ko}{l.note ? ' — ' + l.note : ''}</div>
                  <div className="rv-muted rv-small">{catLine(l.cat)}</div>
                </div>
                <div className="rv-num">
                  {U.inCurrency(l.amount, rec.currency)}
                  {U.isForeign(rec) && (
                    <div className="rv-muted rv-small">{U.money(l.usd)}</div>
                  )}
                </div>
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
        {urls.filter(Boolean).length > 0 && (
          <>
            <div className="rv-photos">
              {urls.map((u, i) => (
                <div key={i} className={'rv-photo' + (i === 0 ? ' rv-photo-main' : '')}>
                  {u
                    ? <img src={u} alt={i === 0 ? '대표 사진' : '증빙 사진 ' + i}
                           onClick={() => setBig(u)} />
                    : <div className="rv-photo-gone">사진을<br />못 불러왔어</div>}
                  {urls.length > 1 && (
                    <span className="rv-photo-tag">{i === 0 ? '대표 · 정산' : '증빙 ' + i}</span>
                  )}
                </div>
              ))}
            </div>
            {urls.length > 1 && (
              <p className="rv-muted rv-small">
                이 거래의 증빙 {urls.length}장. 눌러서 크게 볼 수 있어.
              </p>
            )}
          </>
        )}

        {big && (
          <div className="rv-lightbox" onClick={() => setBig(null)}>
            <img src={big} alt="영수증" />
            <button className="rv-lightbox-x" onClick={() => setBig(null)}>닫기 ✕</button>
          </div>
        )}

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

  // 장부를 바꾸면 이 칸들도 그 장부 것으로 갈아끼운다.
  //
  // useState 의 초기값은 처음 한 번만 쓰인다. 그런데 설정 화면은 장부를 바꿔도
  // 그대로 떠 있어서, 칸에는 이전 장부의 이름이 남아 있었다. 그 상태로 저장하면
  // 공방 이름이 리모델링 장부에 덮어써졌다 — 두 장부가 이름을 공유하는 것처럼 보인 이유다.
  useEffect(() => {
    setFields({
      name: ledger.name || '',
      business_name: ledger.business_name || '',
      taxpayer_name: ledger.taxpayer_name || '',
    });
    // 이전 장부에 대고 띄운 안내와 입력도 같이 치운다
    setMsg(''); setErr(''); setEmail(''); setRole('editor'); setDropping(null);
  }, [ledger.id]);

  const [quota, setQuota] = useState(null);
  const [diag, setDiag] = useState(null);
  const [diagOpen, setDiagOpen] = useState(false);   // 접어 둔 상태로 시작

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

  // ---- 같이 쓰는 사람 내보내기 ----
  const [dropping, setDropping] = useState(null);

  async function dropMember(m) {
    setErr(''); setMsg('');
    try {
      await DB.removeMember(ledger.id, m.user_id);
      setDropping(null);
      setMsg(U.shortName(m.email) + ' 을(를) 이 장부에서 뺐어. ' +
             '넣었던 영수증은 그대로 남아 있어 — 기록이니까.');
      onReload();
    } catch (ex) { setErr(ex.message || '내보내지 못했어요.'); }
  }

  // ---- 백업 ----
  // 사진을 한 장씩 받아 zip 으로 묶는다. 폰에서는 수십 초 걸릴 수 있어서
  // 몇 장째인지 계속 보여준다 — 멈춘 줄 알고 화면을 떠나면 처음부터 다시다.
  //
  // 파일은 연도마다 하나다. 매번 새 이름으로 받으면 드라이브에 같은 사진이
  // 몇 겹씩 쌓인다. 지난 연도는 신고가 끝나면 안 바뀌니 한 번 받으면 끝이고,
  // 올해 것만 가끔 갈아끼우면 된다.
  const [bk, setBk] = useState(null);            // { done, total, label }
  const [bkDone, setBkDone] = useState('');
  const [bkYear, setBkYear] = useState(String(new Date().getFullYear()));
  const [stats, setStats] = useState({});
  const [marks, setMarks] = useState({});        // 언제 무엇까지 받아뒀는지

  const MARK_KEY = ledger ? 'rv_backup_' + ledger.id : '';

  useEffect(() => {
    let alive = true;
    if (!ledger) return;
    DB.backupStats(ledger.id).then((s) => { if (alive) setStats(s); }, () => {});
    try {
      setMarks(JSON.parse(localStorage.getItem('rv_backup_' + ledger.id) || '{}'));
    } catch (e) { setMarks({}); }
    return () => { alive = false; };
  }, [ledger && ledger.id]);

  const bkYears = useMemo(
    () => Object.keys(stats).filter((k) => k !== 'all').sort().reverse(), [stats]);

  // 올해 영수증이 없으면 목록에 올해가 없다. 그러면 <select> 는 첫 줄을 보여주는데
  // 상태는 올해에 머물러서, 보이는 연도를 눌러도 아무 일이 안 일어난다.
  // 자료가 있는 연도로 옮겨준다.
  useEffect(() => {
    if (!bkYears.length) return;
    if (bkYear && bkYears.indexOf(bkYear) < 0) setBkYear(bkYears[0]);
  }, [bkYears, bkYear]);

  const cur = stats[bkYear || 'all'] || { n: 0, photos: 0, latest: '' };
  const mark = marks[bkYear || 'all'];

  // 지난 백업 뒤로 새로 들어온 게 있나
  const bkState = useMemo(() => {
    if (!cur.n) return { kind: 'empty', text: '이 범위에는 영수증이 없어.' };
    const when = mark && mark.at ? mark.at.slice(5, 10).replace('-', '/') : '';
    if (!mark) {
      return { kind: 'never', text: '아직 한 번도 안 받았어. 지금 받아둬.' };
    }
    if (mark.latest >= cur.latest && mark.n === cur.n) {
      return { kind: 'ok', text: when + '에 받았고 그 뒤로 바뀐 게 없어 — 다시 안 받아도 돼.' };
    }
    const added = Math.max(0, cur.n - (mark.n || 0));
    return {
      kind: 'stale',
      text: when + ' 이후로 ' + (added ? '영수증 ' + added + '건이 늘었어.' : '내용이 바뀌었어.') +
            ' 받아서 같은 이름 파일을 덮어써.',
    };
  }, [cur.n, cur.latest, mark]);

  // 사진 한 장이 대략 200KB 남짓이다 (1600px, 품질 0.72). 정확할 필요는 없고
  // "몇 초 걸리나 / 드라이브에 부담되나" 만 가늠되면 된다.
  const bkSize = cur.photos ? Math.max(1, Math.round(cur.photos * 0.21)) : 0;

  function bkLabel(k) {
    const s = stats[k] || { n: 0 };
    const name = k === 'all' ? '이 장부 전체' : k + '년';
    return name + (s.n ? ' · ' + s.n + '건' : ' · 없음');
  }

  async function runBackup() {
    setErr(''); setBkDone(''); setBk({ done: 0, total: 0, label: '' });
    try {
      const rows = await DB.list({ ledgerId: ledger.id, year: bkYear || undefined });
      if (!rows.length) {
        setBk(null);
        return setErr('이 범위에 영수증이 없어. 받을 게 없네.');
      }
      const got = await window.RV_BACKUP.build(ledger, rows, (done, total, label) => {
        setBk({ done: done, total: total, label: label ? '사진: ' + label : '' });
      });

      // 이름에 오늘 날짜를 넣지 않는다. 같은 연도는 같은 파일이어야
      // 드라이브에서 덮어쓰기가 되고, 사진이 몇 겹씩 쌓이지 않는다.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(got.blob);
      // 압축을 풀면 zip 이름 그대로 폴더가 생긴다. 그러니 zip 이름이 곧 폴더 이름이고,
      // 드라이브에서 훑을 때 이게 뭔지 한눈에 보여야 한다.
      a.download = 'ReceiptVault-backup-' + window.RV_BACKUP.safeName(ledger.name) +
                   '-' + (bkYear || '전체') + '.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);

      // 어디까지 받아뒀는지 기록해 둔다 (이 폰에만 남는다)
      const next = Object.assign({}, marks, {
        [bkYear || 'all']: { at: new Date().toISOString(), n: rows.length, latest: cur.latest },
      });
      setMarks(next);
      try { localStorage.setItem(MARK_KEY, JSON.stringify(next)); } catch (e) {}

      setBk(null);
      setBkDone(
        '받았어 — 영수증 ' + rows.length + '건, 사진 ' + got.photos + '장. ' +
        (got.missing.length
          ? '다만 사진 ' + got.missing.length + '장을 못 받았어. zip 안 README.txt 에 목록이 있어 — ' +
            '인터넷이 끊겼던 거면 다시 한 번 받아줘.'
          : '다운로드 폴더에 있어.')
      );
    } catch (ex) {
      setBk(null);
      setErr(ex && ex.message === 'BACKUP_TOO_BIG'
        ? '사진이 너무 많아서 한 번에 못 묶어. 위에서 연도를 하나 골라 나눠 받아줘.'
        : (ex.message || '백업을 만들지 못했어.'));
    }
  }

  return (
    <div className="rv-screen">
      <div className="rv-topbar"><span /><strong>설정</strong><span /></div>
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
              {/* 내보내기가 없으면 한번 들인 사람을 앱에서 뺄 방법이 없다.
                  가족끼리는 문제가 안 되지만 모임에 열어주면 반드시 필요해진다. */}
              {isOwner && m.role !== 'owner' && (
                dropping === m.user_id ? (
                  <span className="rv-member-confirm">
                    <button className="rv-btn-danger rv-tiny"
                            onClick={() => dropMember(m)}>정말 뺄까</button>
                    <button className="rv-btn-ghost rv-tiny"
                            onClick={() => setDropping(null)}>취소</button>
                  </span>
                ) : (
                  <button className="rv-btn-ghost rv-tiny"
                          onClick={() => setDropping(m.user_id)}>내보내기</button>
                )
              )}
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
        <p className="rv-muted rv-small">
          다만 <strong>Supabase 무료 요금제에는 자동 백업이 없어.</strong> 사진은 유료 요금제의
          백업에도 안 들어가고, 장부를 오래 안 쓰면 프로젝트가 잠들었다가 1년이 지나면
          되살릴 수 없게 돼. 그러니 아래 <strong>백업</strong>으로 받은 파일이 진짜 사본이야.
        </p>

        {/* ---- 백업 ----
             서버 하나에만 있는 자료는 백업이 아니다. 무료 Supabase 에는 자동 백업이
             없고, 사진은 유료 요금제의 백업에도 안 들어간다. 그래서 손에 쥐는 파일을
             만들어 준다. 앱이 없어져도 열리는 형태여야 의미가 있다. */}
        <h3 className="rv-h3"><L k="backup" /></h3>
        <p className="rv-muted rv-small">
          영수증 표와 <strong>사진 원본</strong>을 zip 하나로 내려받아.
          사진 이름이 <em>「날짜 가맹점」</em>이라 앱 없이 탐색기에서도 찾을 수 있고,
          표는 엑셀에서 바로 열려. <strong>종이 영수증을 버릴 거면 이걸 꼭 받아둬</strong> —
          그때부터는 이 사진이 유일한 증빙이야.
        </p>
        <div className="rv-row">
          <label className="rv-label rv-grow">받을 범위
            <select className="rv-input" value={bkYear}
                    onChange={(e) => setBkYear(e.target.value)}>
              {bkYears.map((y) => <option key={y} value={y}>{bkLabel(y)}</option>)}
              <option value="">{bkLabel('all')}</option>
            </select>
          </label>
        </div>

        {/* 지금 받아야 하는지 아닌지를 먼저 말해준다.
            매번 받으라고만 하면 결국 안 받게 된다. */}
        <p className={'rv-bkstate rv-bkstate-' + bkState.kind}>
          {bkState.kind === 'ok' ? '✓ ' : bkState.kind === 'empty' ? '' : '● '}
          {bkState.text}
          {cur.photos > 0 && bkState.kind !== 'empty' &&
            ' (사진 ' + cur.photos + '장 · 약 ' + bkSize + 'MB)'}
        </p>

        <button className="rv-btn rv-wide-sm" disabled={!!bk || !cur.n} onClick={runBackup}>
          {bk ? (bk.total ? '내려받는 중 ' + bk.done + ' / ' + bk.total : '준비 중...')
              : '⬇ ' + (bkYear ? bkYear + '년' : '전체') + ' 백업 받기'}
        </button>
        {bk && bk.label && <p className="rv-muted rv-small">{bk.label}</p>}
        {bkDone && (
          <Banner kind="info" onClose={() => setBkDone('')}>{bkDone}</Banner>
        )}

        <p className="rv-muted rv-small">
          <strong>연도마다 파일 하나야.</strong> 이름은{' '}
          <code className="rv-code">ReceiptVault-backup-{ledger.name}-{bkYear || '전체'}.zip</code>{' '}
          — 압축을 풀면 이 이름 그대로 폴더가 생겨.
          날짜를 안 붙여서 다시 받으면 같은 이름이 나와 —
          드라이브에서 <strong>덮어쓰기</strong>를 고르면 사진이 겹겹이 쌓이지 않아.
          지난 연도는 신고가 끝나면 더 안 바뀌니까 <strong>한 번만 받으면 끝</strong>이고,
          올해 것만 가끔 갈아끼우면 돼.
        </p>
        <details className="rv-howto">
          <summary>드라이브에 올리는 법 <span className="rv-howto-tag">3번만 하면 손에 익어</span></summary>
          <ol className="rv-steps">
            <li>위 버튼을 누르면 <strong>다운로드</strong> 폴더에 저장돼.</li>
            <li>알림을 바로 누르거나, <strong>내 파일 → 다운로드</strong>로 들어가.</li>
            <li>그 zip 을 <strong>길게 눌러 → 공유 → 드라이브</strong>.</li>
            <li>ReceiptVault 폴더를 하나 만들어 두고 늘 거기로. 같은 이름이면
                <strong> 덮어쓰기</strong>를 골라.</li>
          </ol>
          <p className="rv-muted rv-small">
            앱에서 드라이브로 바로 올리는 버튼도 만들 수 있는데, 구글 쪽 설정이 필요해서
            PC 생기면 그때 붙이자. 지금은 이 방법이 더 빨라.
          </p>
        </details>
        <p className="rv-muted rv-small">
          사업 경비는 신고한 해로부터 <strong>3년</strong>, 집 공사비는 <strong>집을 판 뒤 3년</strong>까지
          보관해야 해 — 집 쪽은 사실상 갖고 있는 내내야.
        </p>

        {/* ---- 점검 ----
             버튼은 맨 위 오른쪽 아이콘으로 옮겼다. 설명만 여기 남긴다 —
             아이콘만 있으면 눌러도 되는 건지 알 수가 없어서. */}
        <h3 className="rv-h3"><L k="maintenance" /></h3>
        <p className="rv-muted rv-small">
          앱 <strong>맨 위 오른쪽 ⟳</strong> 가 <strong>새로고침</strong>이야. 어느 화면에서든
          누를 수 있어. 저장된 캐시를 지우고 최신 파일을 새로 받아 — 코드를 고쳤는데 화면이
          그대로일 때 누르면 돼. 영수증 자료는 서버에 있으니 지워지지 않아.
          맨 위에 보이는 시각이 <strong>지금 돌아가는 코드가 올라간 때</strong>야.
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

  // ---- 대문 ----
  // 두 가지를 다 기다린다: 최소 표시 시간과 실제 준비 완료.
  // 시간만 재면 준비가 늦을 때 대문 다음에 또 로딩이 뜨고,
  // 준비만 보면 빠를 때 0.1초 번쩍이고 사라져서 오히려 지저분하다.
  const [minDone, setMinDone] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), 900);
    return () => clearTimeout(t);
  }, []);
  const bootBusy = booting || session === undefined;
  const splashOut = minDone && !bootBusy;
  useEffect(() => {
    if (!splashOut || splashGone) return;
    const t = setTimeout(() => setSplashGone(true), 420);  // 사라지는 시간과 맞춘다
    return () => clearTimeout(t);
  }, [splashOut, splashGone]);
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
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState(null);            // null | add | edit | detail | tax

  // 쓰다 만 영수증이 있으면 그 화면으로 돌아간다.
  //
  // 초안은 계속 저장되고 있었는데, 앱이 다시 뜨면 화면이 목록으로 떨어져서
  // 사용자 눈에는 "다 사라졌다" 로 보였다. 저장된 걸 되살려도 그 화면을
  // 다시 열어주지 않으면 소용이 없다.
  const resumed = useRef(false);
  useEffect(() => {
    if (!ledgerId || resumed.current) return;
    resumed.current = true;
    try {
      const raw = localStorage.getItem('rv_draft_' + ledgerId);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || !d.at || Date.now() - d.at > 86400000) return;
      const r = d.rec || {};
      const hasContent = !!(r.merchant || r.amount_original || r.notes ||
                            (r.splits && r.splits.length));
      // 사진만 붙여두고 앱이 죽은 경우도 이어서 써야 한다
      window.RV_DRAFT.get('rv_draft_' + ledgerId).then((blobs) => {
        if (hasContent || blobs.length) setMode('add');
      });
    } catch (e) {}
  }, [ledgerId]);
  const [current, setCurrent] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());

  // 장부가 실제로 갖고 있는 연도와 가맹점 목록
  const [vocab, setVocab] = useState({ years: [], merchants: [] });
  useEffect(() => {
    let alive = true;
    if (!ledgerId) { setVocab({ years: [], merchants: [] }); return; }
    DB.vocab(ledgerId).then((v) => { if (alive) setVocab(v); }, () => {});
    return () => { alive = false; };
  }, [ledgerId, rows]);

  // 연도 칸은 "정해진 범위" 가 아니라 "정해진 범위 + 실제로 자료가 있는 연도" 다.
  // 범위로만 만들면 AI가 연도를 잘못 읽어 저장된 영수증을 찾아갈 방법이 없어진다.
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const first = Math.min(window.RV_CONFIG.FIRST_YEAR || now, now);
    const set = new Set(vocab.years);
    for (let y = now; y >= first; y--) set.add(y);
    set.add(year);
    return Array.from(set).sort((a, b) => b - a);
  }, [vocab.years, year]);

  useEffect(() => {
    if (!DB.configured()) { setSession(null); return; }
    DB.getSession().then(setSession);
    // 토큰은 주기적으로 갱신된다. 그때마다 session 객체가 새로 오는데,
    // 그걸 그대로 넣으면 아래 boot 이 다시 돌고 화면이 통째로 다시 그려진다.
    // 영수증을 쓰던 중이었다면 붙여둔 사진이 그 자리에서 사라진다.
    // 사람이 바뀐 게 아니면 굳이 갈아끼우지 않는다.
    return DB.onAuthChange((next) => {
      setSession((prev) => {
        const same = prev && next && prev.user && next.user &&
                     prev.user.id === next.user.id;
        return same ? prev : next;
      });
    });
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
      // 맨 위에는 날짜와 시각만. 버전 번호는 설정 → 앱 정보에서 본다.
      setStamp(d ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
                   String(d.getHours()).padStart(2, '0') + ':' +
                   String(d.getMinutes()).padStart(2, '0') : '');
    });
    return () => { alive = false; };
  }, []);

  // 장부마다 앱 색이 바뀐다. 강조색 두 개만 갈아끼우면 화면 전체가 따라온다.
  const K = ledger ? window.RV_KIND(ledger.kind) : null;
  // 대문은 모든 화면 위에 덮인다. 아래에서는 앱이 이미 그려지고 있어서,
  // 대문이 걷힐 때는 이미 완성된 화면이 드러난다.
  const withSplash = (node) => (
    <>{node}{!splashGone && <Splash out={splashOut} />}</>
  );

  const skin = (node) => (
    <div className="rv-root"
         style={K ? { '--tan': K.accent, '--tan-dim': K.accentDim } : undefined}>
      {node}
      {!splashGone && <Splash out={splashOut} />}
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

  // 파일이 섞여 올라간 경우. 예전 app.jsx + 새 categories.js 같은 조합이면
  // 화면이 통째로 안 뜨거나 자동 인식만 조용히 죽는다. 그럴 때 원인을 말해준다.
  const missing = ['RV_KIND', 'RV_CATS', 'RV_PROFILES', 'RV_T', 'RV_CAT']
    .filter((k) => !window[k]);
  if (missing.length) {
    return (
      <div className="rv-center">
        <div className="rv-card">
          <div className="rv-logo">파일이 섞였어</div>
          <p className="rv-muted rv-small">
            앱 파일 일부가 예전 것이라 서로 못 알아보는 상태야.
            아래 버튼을 누르면 전부 새로 받아와. 저장한 영수증은 그대로 있어.
          </p>
          <p className="rv-muted rv-small">없는 것: {missing.join(', ')}</p>
          <button className="rv-btn" onClick={() => window.RV_APP.hardRefresh()}>
            전부 새로 받기
          </button>
        </div>
      </div>
    );
  }

  // 대문이 아직 덮여 있으면 그 아래 로딩 표시는 보여줄 필요가 없다.
  if (session === undefined) {
    return splashGone ? <div className="rv-center"><Spinner /></div> : <Splash out={splashOut} />;
  }
  if (session === null) return withSplash(<SignIn />);
  if (booting) {
    return splashGone
      ? <div className="rv-center"><Spinner label="장부 여는 중..." /></div>
      : <Splash out={splashOut} />;
  }

  // 장부를 못 불러온 채로 "장부 만들기" 화면을 띄우면, 자료가 멀쩡히 있는데도
  // 없는 줄 알고 하나를 더 만들게 된다. 그러면 진짜 장부는 안 보인 채로 남는다.
  // 실패했을 때는 실패했다고 말하고 다시 시도할 길만 준다.
  if (err && !ledger && mode !== 'newledger') {
    return (
      <div className="rv-center">
        <div className="rv-boot-fail">
          <h3 className="rv-h3">장부를 못 불러왔어</h3>
          <p className="rv-muted rv-small">{err}</p>
          <p className="rv-muted rv-small">
            보통 인터넷이 잠깐 끊긴 거야. 자료는 그대로 있어 —
            <strong> 여기서 장부를 새로 만들지 마.</strong> 하나 더 생겨서 헷갈려져.
          </p>
          <button className="rv-btn rv-wide" onClick={() => { setErr(''); boot(); }}>
            다시 시도
          </button>
          <button className="rv-btn-ghost rv-wide"
                  onClick={() => { setErr(''); setMode('newledger'); }}>
            그래도 새 장부 만들기
          </button>
        </div>
      </div>
    );
  }

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
        merchants={vocab.merchants}
        session={session}
        // 방금 저장한 영수증이 다른 연도로 들어갔으면 그 연도로 옮겨간다.
        // 안 그러면 저장은 됐는데 목록에 없어서 "저장이 안 된다" 로 보인다.
        onDone={(saved) => {
          const y = Number(String(saved && saved.purchased_at || '').slice(0, 4));
          if (y && y !== year) setYear(y);
          setMode(null); setCurrent(null); load();
        }}
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
      <LedgerBar ledger={ledger} ledgers={ledgers} stamp={stamp} refreshing={refreshing}
                 onOpen={() => setSheet(true)}
                 onRefresh={() => {
                   setRefreshing(true);
                   // 지금 보고 있는 탭으로 돌아오게 한다
                   window.RV_APP.hardRefresh(tab);
                 }} />

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
        <Report rows={rows} year={year} ledger={ledger}
                onTaxDoc={() => setMode('tax')}
                onOpen={(r) => { setCurrent(r); setMode('detail'); }} />
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
