// labels.js — 화면에 나오는 항목 이름과 제목.
//
// 표기 규칙:
//   en 은 크게, ko 는 작게 옆에 붙는다.
//   ko 가 없는 항목은 양쪽 나라에서 그대로 쓰는 말이라 영문만 보여준다
//   (Email, PDF, CSV, AI, Schedule C, USD ...).
//
// 설명문·안내문은 여기 없다. 그건 앱을 쓰는 사람이 읽는 글이라 한국어로 둔다.
// 여기 있는 건 "항목 이름과 제목" — 세무사와 화면을 같이 볼 수 있어야 하는 것들.

window.RV_T = {
  // --- 화면 이름 ---
  receipts:      { en: 'Receipts',      ko: '영수증' },
  summary:       { en: 'Summary',       ko: '정리' },
  settings:      { en: 'Settings',      ko: '설정' },
  addReceipt:    { en: 'Add Receipt',   ko: '영수증 추가' },
  editReceipt:   { en: 'Edit Receipt',  ko: '영수증 수정' },
  taxPacket:     { en: 'Accountant Packet', ko: '세무사 자료' },
  newLedger:     { en: 'New Ledger',    ko: '장부 만들기' },

  // --- 영수증 항목 ---
  date:          { en: 'Date',          ko: '거래일' },
  merchant:      { en: 'Merchant',      ko: '가맹점' },
  country:       { en: 'Country',       ko: '구입 국가' },
  amount:        { en: 'Amount',        ko: '금액' },
  currency:      { en: 'Currency',      ko: '통화' },
  amountUsd:     { en: 'Amount in USD', ko: '달러 환산' },
  salesTax:      { en: 'Sales Tax',     ko: '세금' },
  category:      { en: 'Category',      ko: '분류' },
  payment:       { en: 'Payment',       ko: '결제 수단' },
  businessUse:   { en: 'Business Use %',ko: '사업 사용 비율' },
  purpose:       { en: 'Business Purpose', ko: '사업 목적 · 구입 내역' },
  deductible:    { en: 'Deductible',    ko: '공제 반영액' },
  split:         { en: 'Split Categories', ko: '분류 나누기' },
  enteredBy:     { en: 'Entered by',    ko: '입력한 사람' },
  uploadedAt:    { en: 'Uploaded',      ko: '올린 시각' },
  exchangeRate:  { en: 'Exchange Rate', ko: '적용 환율' },

  // --- 장부·사람 ---
  ledger:        { en: 'Ledger',        ko: '장부' },
  ledgerName:    { en: 'Ledger Name',   ko: '장부 이름' },
  businessName:  { en: 'Business Name', ko: '사업체명' },
  taxpayerName:  { en: 'Taxpayer Name', ko: '납세자명' },
  members:       { en: 'Members',       ko: '같이 쓰는 사람' },
  invite:        { en: 'Invite',        ko: '초대' },
  role:          { en: 'Role',          ko: '권한' },
  owner:         { en: 'Owner',         ko: '주인' },
  editor:        { en: 'Editor',        ko: '입력 가능' },
  viewer:        { en: 'Viewer',        ko: '보기만' },

  // --- 버튼 ---
  save:          { en: 'Save',          ko: '저장' },
  cancel:        { en: 'Cancel',        ko: '취소' },
  add:           { en: 'Add',           ko: '추가' },
  edit:          { en: 'Edit',          ko: '수정' },
  del:           { en: 'Delete',        ko: '삭제' },
  back:          { en: 'Back',          ko: '뒤로' },
  create:        { en: 'Create',        ko: '만들기' },
  signOut:       { en: 'Sign out',      ko: '로그아웃' },
  takePhoto:     { en: 'Take Photo',    ko: '영수증 촬영' },
  fromGallery:   { en: 'From Gallery',  ko: '스크린샷 · 갤러리' },
  addLine:       { en: 'Add Line',      ko: '줄 추가' },
  fillRest:      { en: 'Fill Rest',     ko: '나머지 넣기' },

  // --- 세무 ---
  cogs:          { en: 'Cost of Goods Sold', ko: '매출원가' },
  expenses:      { en: 'Expenses',      ko: '경비' },
  total:         { en: 'Total',         ko: '합계' },
  line:          { en: 'Line',          ko: '줄번호' },
  items:         { en: 'Items',         ko: '건수' },

  // --- 양쪽에서 그대로 쓰는 말 (영문만) ---
  email:         { en: 'Email' },
  aiUsage:       { en: 'AI Usage' },
  pdf:           { en: 'PDF' },
  csv:           { en: 'CSV' },
  scheduleC:     { en: 'Schedule C' },
};

// 나라 목록. 필요한 것만. AI가 알아낸 값이 여기 없으면 '기타'로 들어간다.
window.RV_COUNTRIES = [
  { code: 'US', en: 'United States', ko: '미국',   currency: 'USD' },
  { code: 'KR', en: 'South Korea',   ko: '한국',   currency: 'KRW' },
  { code: 'JP', en: 'Japan',         ko: '일본',   currency: 'JPY' },
  { code: 'CN', en: 'China',         ko: '중국',   currency: 'CNY' },
  { code: 'GB', en: 'United Kingdom',ko: '영국',   currency: 'GBP' },
  { code: 'DE', en: 'Germany',       ko: '독일',   currency: 'EUR' },
  { code: 'IT', en: 'Italy',         ko: '이탈리아', currency: 'EUR' },
  { code: 'FR', en: 'France',        ko: '프랑스', currency: 'EUR' },
  { code: 'CA', en: 'Canada',        ko: '캐나다', currency: 'CAD' },
  { code: 'MX', en: 'Mexico',        ko: '멕시코', currency: 'MXN' },
  { code: 'XX', en: 'Other',         ko: '기타',   currency: 'USD' },
];

// 지원 통화. 환율 조회가 되는 것들.
window.RV_CURRENCIES = ['USD', 'KRW', 'JPY', 'EUR', 'GBP', 'CNY', 'CAD', 'MXN', 'AUD', 'CHF'];

window.RV_COUNTRY = function (code) {
  return window.RV_COUNTRIES.find(function (c) { return c.code === code; })
      || window.RV_COUNTRIES[window.RV_COUNTRIES.length - 1];
};
