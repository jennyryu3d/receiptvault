// config.js — 이 파일 하나만 채우면 앱이 붙는다.
//
// 여기 들어가는 값은 전부 "브라우저에 공개돼도 되는" 값이다.
// Supabase anon key는 공개용 키이고, 실제 보호는 RLS(본인 데이터만 조회 가능)가 한다.
// 진짜 비밀인 Anthropic API 키는 이 파일에 절대 넣지 않는다 — Cloudflare Worker 안에만 있다.

window.RV_CONFIG = {
  APP_NAME: 'ReceiptVault',
  APP_VERSION: '0.8.0',
  DEVELOPER: 'Jenny Ryu',
  COPYRIGHT_YEAR: 2026,
  STAGE: 'dev',
  // Supabase → Project Settings → Data API 에서 복사
  SUPABASE_URL: 'https://qkeocwypitffhrklodxl.supabase.co',       // 예: https://abcdefghijkl.supabase.co
  SUPABASE_ANON_KEY: 'sb_publishable_WlLOJ69HXuBnxs47eDPjyw_agbE0kBR',  // 예: eyJhbGciOi... (publishable / anon key)

  // Cloudflare Worker 주소. 비워두면 AI 자동 인식 버튼이 숨겨지고
  // 수동 입력만으로 앱이 정상 동작한다.
  AI_PROXY_URL: 'https://receiptvault-proxy.jenny3d.workers.dev/extract',       // 예: https://receiptvault-proxy.jenny3d.workers.dev/extract

  CURRENCY: 'USD',
  LOCALE: 'en-US',

  // 사업 시작일. 리포트에서 연도 목록을 만들 때 시작점으로 쓴다.
  FIRST_YEAR: 2026,
};
