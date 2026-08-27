// categories.js — 장부 종류(프로필)와 분류표.
//
// ===============================================================
// 이 파일이 이 앱에서 유일하게 "세금 지식"을 담은 곳이다.
// 새 장부 종류나 새 업종을 늘리는 일은 전부 여기서만 하면 된다.
// 화면 코드(app.jsx)는 여기 적힌 대로 그릴 뿐, 종류를 하나도 모른다.
// ===============================================================
//
// 세 가지를 따로 둔다. 섞으면 하나 늘릴 때마다 화면 코드를 뜯어야 한다.
//
//   1. 분류표 (RV_CAT_SETS)  — 무엇을 샀는지 고르는 목록. 업종마다 다르다.
//   2. 장부 종류 (RV_PROFILES) — 그 돈이 세금에서 어떤 뜻인지. 보고서 생김새가 여기서 갈린다.
//   3. 장부 (ledgers 표)      — 실제 하나의 사업체·하나의 집. 몇 개든 만든다.
//
// 이 앱이 다루는 것은 세금에 쓰이는 영수증뿐이다.
//   지금 신고에 들어가는 것 (사업 경비 → Schedule C)
//   나중 신고에 쓰이는 것 (집 개량 → 취득원가)
// 세금과 무관한 지출은 이 앱에 넣지 않는다. 그게 이 앱의 경계다.
//
// 나중에 늘려야 할 일이 실제로 생기면:
//   새 업종 (예: 사서 되파는 판매업) → RV_CAT_SETS 에 분류표 하나 + business 의 catSets 에 이름
//   새 신고서 (예: 임대 부동산 Schedule E) → RV_PROFILES 에 항목 하나
// 둘 다 이 파일 안에서 끝난다. 화면 코드(app.jsx)는 건드리지 않는다.

// ===============================================================
// 1. 분류표
// ===============================================================
//
// deduct: 그 분류로 넣은 돈 중 실제로 "인정되는" 비율.
//   사업 장부  → 공제율 (식비만 0.5)
//   부동산 장부 → 집값에 더해지면 1, 아니면 0
//
// line: 신고서 줄번호. 없는 종류면 빈 문자열.
// ord:  줄번호가 없을 때의 정렬 순서.
//
// key 는 앱 전체에서 유일해야 한다. 이미 저장된 영수증이 이 key 로 자기 분류를
// 찾기 때문에, 한 번 쓴 key 는 절대 바꾸지 않는다.
//   (접두사 없음 = 가죽공방, p_ = 집 공사)

// ---------------------------------------------------------------
// 가죽공방 — Schedule C
// ---------------------------------------------------------------
var LEATHER = [
  // ---------- 매출원가 (Part III) ----------
  { key: 'cogs_material', group: 'cogs', line: '36',
    ko: '가죽 · 원자재', en: 'Purchases (COGS)', deduct: 1,
    hint: '완성품에 들어가는 가죽, 원단 등 주재료' },

  { key: 'cogs_supplies', group: 'cogs', line: '38',
    ko: '부자재 · 제작 소모품', en: 'Materials and supplies (COGS)', deduct: 1,
    hint: '실, 버클, 스냅, 염료, 마감재처럼 제품에 들어가는 부자재' },

  // ---------- 일반 경비 (Part II) ----------
  { key: 'supplies', group: 'expense', line: '22',
    ko: '공구 · 작업 소모품', en: 'Supplies', deduct: 1,
    hint: '제품에 안 들어가고 작업에 쓰는 것 — 칼날, 사포, 장갑, 청소용품' },

  { key: 'equipment', group: 'expense', line: '13',
    ko: '장비 구입', en: 'Depreciation / Section 179', deduct: 1,
    hint: '재봉기, 재단기처럼 오래 쓰는 장비. 감가상각 대상이라 따로 모음' },

  { key: 'rent', group: 'expense', line: '20b',
    ko: '공방 임대료', en: 'Rent or lease — other business property', deduct: 1 },

  { key: 'utilities', group: 'expense', line: '25',
    ko: '공과금', en: 'Utilities', deduct: 1,
    hint: '전기, 수도, 가스, 인터넷' },

  { key: 'advertising', group: 'expense', line: '8',
    ko: '광고 · 마켓 참가비', en: 'Advertising', deduct: 1,
    hint: '인스타 광고, 크래프트 마켓 부스비, 명함, 사진 촬영' },

  { key: 'office', group: 'expense', line: '18',
    ko: '사무 · 소프트웨어', en: 'Office expense', deduct: 1,
    hint: '포장재, 라벨, 문구, 구독 소프트웨어, 도메인' },

  { key: 'fees', group: 'expense', line: '10',
    ko: '판매 수수료', en: 'Commissions and fees', deduct: 1,
    hint: 'Etsy, Square, Stripe, PayPal 수수료' },

  { key: 'repairs', group: 'expense', line: '21',
    ko: '수리 · 유지보수', en: 'Repairs and maintenance', deduct: 1 },

  { key: 'insurance', group: 'expense', line: '15',
    ko: '보험료', en: 'Insurance (other than health)', deduct: 1 },

  { key: 'taxes_licenses', group: 'expense', line: '23',
    ko: '세금 · 라이선스', en: 'Taxes and licenses', deduct: 1,
    hint: '판매세 납부, 사업자 등록, 각종 허가비' },

  { key: 'professional', group: 'expense', line: '17',
    ko: '전문가 비용', en: 'Legal and professional services', deduct: 1,
    hint: '회계사, 변호사, 세무 대행' },

  { key: 'travel', group: 'expense', line: '24a',
    ko: '출장 · 숙박', en: 'Travel', deduct: 1,
    hint: '전시회, 재료 구매 출장의 항공·숙박' },

  { key: 'meals', group: 'expense', line: '24b',
    ko: '식비 (50%만 인정)', en: 'Deductible meals', deduct: 0.5,
    hint: '사업 목적 식사. 미국은 절반만 공제되므로 자동으로 반만 계산됨' },

  { key: 'car', group: 'expense', line: '9',
    ko: '차량 · 주유', en: 'Car and truck expenses', deduct: 1,
    hint: '개인 겸용이면 아래 사업 사용 비율을 꼭 낮춰서 넣을 것' },

  { key: 'shipping', group: 'expense', line: '27a',
    ko: '배송비', en: 'Other expenses — shipping', deduct: 1,
    hint: 'USPS, UPS, FedEx 발송비' },

  { key: 'education', group: 'expense', line: '27a',
    ko: '교육 · 워크숍', en: 'Other expenses — education', deduct: 1,
    hint: '기술 향상을 위한 수업, 온라인 강의, 관련 도서' },

  { key: 'other', group: 'expense', line: '27a',
    ko: '기타', en: 'Other expenses', deduct: 1,
    hint: '어디에도 안 맞으면 여기. 메모에 무엇인지 꼭 적어둘 것' },
];

// ---------------------------------------------------------------
// 집 공사 — 공제가 아니라 취득원가(cost basis)
//
// 기준(IRS Pub. 523): 집의 가치를 올리거나, 수명을 늘리거나, 새 용도에 맞게
// 바꾸면 개량. 그냥 상태를 유지하는 수리는 아니다. 다만 큰 공사의 일부로 한
// 수리는 개량에 포함된다 — 창문 하나 교체는 수리, 전체 리모델 중 창문 전체
// 교체는 개량.
// ---------------------------------------------------------------
var REMODEL = [
  { key: 'p_structure', group: 'basis', ord: 1, line: '', deduct: 1,
    ko: '구조 · 증축', en: 'Addition / structural work',
    hint: '방·욕실 증축, 벽 이동, 골조, 기초, 차고' },

  { key: 'p_kitchen', group: 'basis', ord: 2, line: '', deduct: 1,
    ko: '주방', en: 'Kitchen remodel',
    hint: '캐비닛, 상판, 싱크, 붙박이 주방가전' },

  { key: 'p_bath', group: 'basis', ord: 3, line: '', deduct: 1,
    ko: '욕실', en: 'Bathroom remodel',
    hint: '욕조, 샤워, 세면대, 타일' },

  { key: 'p_interior', group: 'basis', ord: 4, line: '', deduct: 1,
    ko: '내부 마감 · 바닥 · 붙박이', en: 'Interior finishes / flooring / built-ins',
    hint: '바닥재, 몰딩, 붙박이장, 벽난로, 계단' },

  { key: 'p_envelope', group: 'basis', ord: 5, line: '', deduct: 1,
    ko: '지붕 · 창호 · 외벽', en: 'Roof / windows / doors / siding',
    hint: '지붕, 창문, 문, 외벽, 단열' },

  { key: 'p_systems', group: 'basis', ord: 6, line: '', deduct: 1,
    ko: '전기 · 배관 · 냉난방', en: 'Electrical / plumbing / HVAC',
    hint: '배선, 배관, 보일러, 에어컨, 온수기, 보안 시스템' },

  { key: 'p_outdoor', group: 'basis', ord: 7, line: '', deduct: 1,
    ko: '조경 · 외부 구조', en: 'Landscaping / outdoor structures',
    hint: '데크, 파티오, 진입로, 담장, 스프링클러, 조경 공사' },

  { key: 'p_design', group: 'basis', ord: 8, line: '', deduct: 1,
    ko: '설계 · 허가 · 검사', en: 'Design, permits and inspection fees',
    hint: '건축가, 인테리어 설계, 시청 허가비, 검사비' },

  { key: 'p_labor', group: 'basis', ord: 9, line: '', deduct: 1,
    ko: '시공비 · 인건비', en: 'Contractor labor',
    hint: '시공사 기성금, 인건비. 어떤 공사분인지 목적란에 적어둘 것' },

  // ---------- 취득원가에 더해지지 않는 것 ----------
  { key: 'p_repair', group: 'nonbasis', ord: 20, line: '', deduct: 0,
    ko: '수리 · 유지보수 (원가 반영 안 됨)', en: 'Repairs and maintenance (not added to basis)',
    hint: '페인트, 누수 수리, 부품 교체처럼 상태 유지용. 다만 이번 리모델 공사의 일부로 한 것이라면 위의 해당 공사 분류로 넣어' },

  { key: 'p_furnishing', group: 'nonbasis', ord: 21, line: '', deduct: 0,
    ko: '가구 · 소품 (원가 반영 안 됨)', en: 'Furniture and decor (not added to basis)',
    hint: '옮길 수 있는 가구, 러그, 조명 스탠드, 가전(붙박이가 아닌 것)' },

  { key: 'p_other', group: 'nonbasis', ord: 22, line: '', deduct: 0,
    ko: '기타 · 확인 필요', en: 'Other — needs review',
    hint: '성격이 애매한 지출. 목적을 적어두면 나중에 세무사가 판단할 수 있어' },
];

window.RV_CAT_SETS = {
  leather: { key: 'leather', ko: '가죽공방', en: 'Leather studio', cats: LEATHER },
  remodel: { key: 'remodel', ko: '집 공사',  en: 'Home remodel',   cats: REMODEL },
};

// ===============================================================
// 2. 장부 종류 (프로필)
// ===============================================================
//
// 화면과 문서가 여기 적힌 대로 그려진다. 새 종류를 만들려면
// 이 표에 항목 하나를 추가하면 되고, app.jsx 는 건드리지 않는다.
//
// taxScope
//   'filing' — 그 해 세금 신고에 바로 들어간다 (Schedule C 등)
//   'future' — 지금이 아니라 나중에 (집을 팔 때) 쓰인다
//   'none'   — 세금과 무관. 그냥 기록
//
// sections 의 group 은 분류표의 group 값과 짝이 맞아야 한다.

window.RV_PROFILES = {

  business: {
    key: 'business', en: 'Business', ko: '사업', taxScope: 'filing',
    desc: '공방·판매처럼 그 해에 경비로 공제받는 장부. Schedule C 로 정리돼.',
    // 장부마다 앱 색이 바뀐다. 지금 어느 장부에 있는지 글자를 읽지 않아도 알게.
    accent: '#c8a26a', accentDim: '#8a6f45', icon: '✂',   // 가죽 톤
    defaultName: '우리 공방',
    catSets: ['leather'],               // 업종이 늘면 여기에 이름을 더한다
    ai: 'business',                     // Worker 가 쓰는 설명문 종류
    lineLabel: 'Schedule C',            // 줄번호 표기. null 이면 줄번호 없음
    counted: { en: 'Deductible', ko: '공제 반영액' },

    form: {
      businessPct: true,                // 사업 사용 비율 칸을 쓰나
      purposeLabel: 'purpose',
      purposePlaceholder: '무엇을 왜 샀는지 — 예: 가방 제작용 가죽과 실',
      purposeHelp: '비워두면 나중에 세무사가 "이건 무슨 지출이죠?" 하고 되물어. 국세청이 요구하는 기록 항목이기도 해 — 날짜·금액·상호·사업 목적 네 가지야.',
      purposeMissing: '사업 목적이 비어 있어. 세무사 자료에 "무슨 지출인지"가 안 나가. 수정에서 한 줄만 적어줘.',
    },

    entity: {
      nameLabel: '사업체명 (세무사 자료 머리말)',
      namePlaceholder: 'Maedeup Leather Studio',
      ownerLabel: '납세자명',
      docOwner: 'Taxpayer',
    },

    report: {
      sections: [
        { group: 'cogs', title: '매출원가 (Schedule C Part III)',
          pick: '매출원가 — 팔 물건에 들어간 것',
          note: '판매할 물건에 직접 들어간 재료.' },
        { group: 'expense', title: '경비 (Schedule C Part II)',
          pick: '경비',
          note: '신고서와 같은 줄번호 순서로 정렬돼 있어.' },
      ],
      foot: '표시된 금액은 사업 사용 비율과 식비 50% 규칙을 반영한 공제 반영액이야. 실제 지출액이 다르면 아래에 함께 표시돼. 신고 전에는 회계사와 한 번 맞춰보는 걸 권해 — 나는 세무 자문을 할 수 있는 입장이 아니야.',
    },

    doc: {
      screenTitle: '세무사 자료',
      title: 'Business Expense Summary — Tax Year',
      fileTag: '',
      intro: '세무사에게는 이 PDF 한 장과 CSV를 같이 보내면 돼.',
      sections: [
        { group: 'cogs', h2: 'Part III — Cost of Goods Sold', total: 'Total cost of goods sold' },
        { group: 'expense', h2: 'Part II — Expenses', total: 'Total expenses' },
      ],
      grand: 'Total deductible, all categories',
      cumulative: false,
      notes: ['deductibleAmounts', 'meals', 'mixedUse', 'equipment', 'car', 'notTrackedBusiness'],
      reviewedBy: 'taxpayer', reviewedBefore: 'filing',
    },

    csv: { merchantCol: 'merchant', purposeCol: 'business_purpose',
           line: true, businessPct: true, basisFlag: false, amountCol: 'deductible_usd' },
  },

  property: {
    key: 'property', en: 'Property Improvement', ko: '부동산 개량', taxScope: 'future',
    desc: '집 리모델링처럼 그 해에 공제되지 않고 집의 취득원가에 쌓이는 장부. 집을 팔 때 쓰여.',
    accent: '#7fa8c9', accentDim: '#4d6c86', icon: '⌂',   // 집 톤 (푸른색)
    defaultName: '집 리모델링',
    catSets: ['remodel'],
    ai: 'property',
    lineLabel: null,
    counted: { en: 'Added to basis', ko: '취득원가 반영액' },

    form: {
      businessPct: false,
      purposeLabel: 'workDone',
      purposePlaceholder: '무슨 공사에 쓴 건지 — 예: 2층 욕실 타일 · 방수',
      purposeHelp: '비워두면 나중에 이게 집값에 더해지는 개량인지 그냥 수리인지 가릴 수가 없어. 어느 방·어느 공사였는지까지 적어두는 게 좋아.',
      purposeMissing: '무슨 공사였는지가 비어 있어. 나중에 개량인지 수리인지 가릴 근거가 없어져. 수정에서 한 줄만 적어줘.',
    },

    entity: {
      nameLabel: '집 주소 (문서 머리말)',
      namePlaceholder: '123 Example St, Palo Alto CA',
      ownerLabel: '소유자명',
      docOwner: 'Owner',
    },

    report: {
      sections: [
        { group: 'basis', title: '집값에 더해지는 공사',
          pick: '집값에 더해지는 공사 — 나중에 세금을 줄여줘',
          note: '공제가 아니라 집의 취득원가에 쌓여. 집을 팔 때 양도차익에서 빠져.' },
        { group: 'nonbasis', title: '더해지지 않는 지출', gross: true,
          pick: '더해지지 않는 지출 — 기록만 남아',
          note: '수리·가구처럼 취득원가에 안 들어가는 것들. 쓴 돈은 기록되지만 집값에는 안 더해져.' },
      ],
      foot: '이 장부는 그 해에 세금을 줄여주지 않아. 집을 팔 때 쓰려고 쌓아두는 기록이야. 그래서 해마다 신고할 게 아니라 영수증과 사진을 오래 보관하는 것이 핵심이야. 개량인지 수리인지 애매하면 목적란에 자세히 적어두고 나중에 세무사에게 판단을 맡기면 돼.',
    },

    doc: {
      screenTitle: '취득원가 기록',
      title: 'Capital Improvement Record — Cost Basis ·',
      fileTag: 'basis-',
      intro: '이건 지금 제출하는 서류가 아니라 집을 팔 때 쓸 기록이야. PDF와 CSV를 사진과 함께 그때까지 보관해.',
      sections: [
        { group: 'basis', h2: 'Improvements added to cost basis', total: 'Total added to basis, {year}' },
        { group: 'nonbasis', h2: 'Recorded but not added to basis',
          gross: true, total: 'Total not added to basis' },
      ],
      grand: null,
      cumulative: { h2: 'Cumulative basis added, all years',
                    col: 'Added to basis (USD)', total: 'Total improvements to date' },
      notes: ['basisIntro', 'basisTest', 'basisRepairs', 'basisNotAdjusted', 'basisNotIncluded'],
      reviewedBy: 'owner', reviewedBefore: 'the basis figure is used',
    },

    csv: { merchantCol: 'vendor', purposeCol: 'work_description',
           line: false, businessPct: false, basisFlag: true, amountCol: 'basis_amount_usd' },
  },

};

// 세금 성격별 묶음 — 장부 목록에서 크게 나눠 보여줄 때 쓴다
window.RV_TAX_SCOPES = {
  filing: { ko: '세금 신고에 들어가는 장부', en: 'Reported on this year\'s return' },
  future: { ko: '나중에 쓰는 장부', en: 'Used when the asset is sold' },
};

// ===============================================================
// 3. 찾아쓰는 함수들
// ===============================================================

window.RV_KIND = function (kind) {
  return window.RV_PROFILES[kind] || window.RV_PROFILES.business;
};

// 그 장부에서 고를 수 있는 분류 목록.
// ledger 를 통째로 넘겨도 되고 (kind, cat_set) 을 따로 넘겨도 된다.
window.RV_CATS = function (kind, catSet) {
  if (kind && typeof kind === 'object') { catSet = kind.cat_set; kind = kind.kind; }
  var prof = window.RV_KIND(kind);
  var allowed = prof.catSets;
  var pick = (catSet && allowed.indexOf(catSet) >= 0) ? catSet : allowed[0];
  return window.RV_CAT_SETS[pick].cats;
};

window.RV_FIRST_CAT = function (kind, catSet) {
  return window.RV_CATS(kind, catSet)[0].key;
};

// 분류표 목록 (장부를 만들 때 고르게 하려고)
window.RV_CAT_SET_LIST = function (kind) {
  return window.RV_KIND(kind).catSets.map(function (k) { return window.RV_CAT_SETS[k]; });
};

// key 로 분류 찾기 — 모든 표를 하나로 합쳐서 본다.
// 이렇게 해두면 금액 계산 코드는 장부 종류를 전혀 몰라도 된다.
window.RV_CAT_BY_KEY = Object.keys(window.RV_CAT_SETS).reduce(function (acc, setKey) {
  window.RV_CAT_SETS[setKey].cats.forEach(function (c) { acc[c.key] = c; });
  return acc;
}, {});

window.RV_CAT = function (key) {
  return window.RV_CAT_BY_KEY[key] || window.RV_CAT_BY_KEY.other;
};
