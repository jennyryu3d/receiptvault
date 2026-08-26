// categories.js — Schedule C(미국 개인사업자 신고서)에 바로 붙는 경비 분류표.
//
// 왜 이렇게 짰나:
//   "재료비", "공구" 같은 자기만의 이름으로 모아두면 연말에 결국 전부 다시
//   Schedule C 항목으로 옮겨야 한다. 그래서 처음부터 각 분류에 신고서 줄번호를
//   박아둔다. 리포트 화면은 이 line 값으로 묶어서 합계를 낸다.
//
// group:
//   'cogs'    → Part III, 매출원가. 팔 물건을 만들려고 산 것.
//   'expense' → Part II,  일반 경비.
//
// deduct: 공제율. 식비만 0.5 (미국은 사업 식비 50%만 인정).

window.RV_CATEGORIES = [
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

// key로 빠르게 찾기
window.RV_CAT_BY_KEY = window.RV_CATEGORIES.reduce(function (acc, c) {
  acc[c.key] = c;
  return acc;
}, {});

window.RV_CAT = function (key) {
  return window.RV_CAT_BY_KEY[key] || window.RV_CAT_BY_KEY.other;
};
