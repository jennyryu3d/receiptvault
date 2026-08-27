// worker.js — ReceiptVault 영수증 인식 프록시 (Cloudflare Worker)
//
// 왜 이게 필요한가:
//   Anthropic API 키를 앱 코드에 넣으면 브라우저에서 누구나 꺼내 쓸 수 있다.
//   그래서 키는 이 Worker 안에만(secret 으로) 두고, 앱은 이미지를 여기로 보낸다.
//
// 요금이 새지 않게 하는 장치 네 겹:
//   1. 로그인 확인   — Supabase 토큰이 없으면 아예 거절. 주소만 아는 사람은 못 쓴다.
//   2. 사용량 한도   — DB 함수가 1인 하루 / 전체 하루 장수를 세고 막는다.
//   3. 모델·토큰 고정 — 클라이언트가 비싼 모델이나 큰 응답을 요구할 수 없다.
//   4. 이미지 상한   — 큰 파일로 토큰 폭탄을 만들 수 없다.
//
// 한도를 바꾸려면 이 파일이 아니라 Supabase 의 rv_ai_use 함수 안 숫자를 고친다.

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 1024;
const MAX_IMAGE_B64 = 1_500_000; // base64 기준 약 1.1MB 이미지

// 배포 주소가 바뀌면 여기도 같이 고쳐야 한다. 안 그러면 브라우저가 403을 받는다.
const ALLOWED_ORIGINS = [
  'https://jennyryu3d.github.io',
  'https://receipts.jennyryu3d.com',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

// 앱이 쓰는 Supabase 프로젝트. 토큰 검증과 한도 기록에 쓴다.
const SUPABASE_URL = 'https://qkeocwypitffhrklodxl.supabase.co';

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors(origin)),
  });
}

// 장부 종류마다 읽는 눈이 달라야 한다. 리모델링 영수증을 "사업 경비" 로 읽으면
// 분류도 목적문도 엉뚱해진다. 클라이언트가 문장을 넘기지는 못하게 하고,
// 여기 있는 두 가지 중에서만 고른다.
const SETTINGS = {
  business: {
    intro: 'You are reading a purchase receipt for a small leather-craft studio based in California.',
    purpose: 'in English, what was bought and why it is a business expense',
    purposeHelp: 'Name the actual items and, when you can tell, why they serve the business — '
      + 'e.g. "waxed thread and leather dye for bag production", "storage bins for parts".',
  },
  property: {
    intro: 'You are reading a purchase or contractor receipt for the remodeling of a private home '
      + 'in California. The owner is recording costs that may be added to the home\'s cost basis, '
      + 'so the category must reflect what part of the house the money went to.',
    purpose: 'in English, what was bought or done, and which part of the house it was for',
    purposeHelp: 'Name the actual items or work and the room or system — e.g. '
      + '"quartz countertop for kitchen remodel", "rough-in plumbing, upstairs bathroom". '
      + 'If the receipt is a contractor invoice covering several trades, say so.',
  },
};

function buildPrompt(categories, countries, today, kind) {
  const list = (categories || [])
    .map((c) => '- ' + c.key + ': ' + c.label + (c.hint ? ' (' + c.hint + ')' : ''))
    .join('\n');
  const S = SETTINGS[kind === 'property' ? 'property' : 'business'];

  return [
    S.intro,
    'The image is either a photo of a paper receipt or a screenshot of an online order.',
    'The receipt may be in any language and any currency.',
    '',
    'Extract these fields and reply with ONE JSON object and nothing else:',
    '{',
    '  "purchased_at": "YYYY-MM-DD",',
    '  "merchant": "store name exactly as printed, in its own script",',
    '  "merchant_en": "the store name in English",',
    '  "country": "two-letter code of where the purchase happened",',
    '  "currency": "three-letter code of the currency printed on the receipt",',
    '  "amount": 0.00,',
    '  "tax": 0.00,',
    '  "notes_en": "' + S.purpose + '",',
    '  "payment_method": "card|cash|transfer|other",',
    '  "payment_ref": "short label of the card or account used, or null",',
    '  "category": "one key from the list below",',
    '  "splits": null,',
    '  "confidence": 0.0',
    '}',
    '',
    'Category keys:',
    list,
    '',
    'Country codes to choose from: ' + (countries || 'US=United States, KR=South Korea, XX=Other'),
    '',
    'Language and currency:',
    '- "currency" is the currency actually printed on the receipt (USD, KRW, JPY, EUR ...).',
    '  Read it from the symbol (₩ → KRW, ¥ → JPY, € → EUR, $ → usually USD) or from the',
    '  business registration / address. Do NOT convert the amount — report it as printed.',
    '- "amount" is the grand total in that same currency, including tax and shipping.',
    '- "country" is where the purchase happened, inferred from the address, phone number,',
    '  tax id or language on the receipt. Use XX only if there is truly no clue.',
    '',
    'The taxpayer files US taxes, so what reaches her accountant must be English:',
    '- "merchant" keeps the name as printed (Korean stays Korean).',
    '- "merchant_en" is the English form: use the business\'s own English name if it has one,',
    '  otherwise romanize it (한국마켓 → "Hankook Market", 롯데마트 → "Lotte Mart").',
    '- "notes_en" is the most important field for an audit. ' + S.purposeHelp,
    '  Plain English, under 15 words. Leave null only if the line items are unreadable.',
    '- If the receipt is already in English, set merchant_en to the same value as merchant.',
    '',
    'Rules:',
    '- Amounts are numbers, no currency symbols, no thousands separators.',
    '- If the year is missing on the receipt, assume the most recent year that makes the',
    '  date fall on or before ' + (today || 'today') + '.',
    '- Splitting rule: leave "splits" null when the whole receipt belongs to one category.',
    '  When line items clearly belong to different categories AND you can read the',
    '  per-item amounts, return',
    '    "splits": [{"category": "<key>", "amount": 0.00, "note": "short English label"}, ...]',
    '  Split amounts are in the SAME currency as "amount" and MUST add up to it exactly —',
    '  distribute tax and shipping in proportion, putting any leftover on the largest part.',
    '  Use at most 4 parts. If you cannot read reliable per-item amounts, return null.',
    '- "category" is always filled in: the single category, or the largest part when split.',
    '- "payment_ref" identifies which card or account paid, so it can be matched against a',
    '  statement later. Receipts usually print the brand and the last four digits — return',
    '  them as e.g. "Visa ...4821", "Amex ...1007", "Cash". NEVER return a full card number:',
    '  if more than four digits are visible, keep only the last four. Null if not shown.',
    '- Never invent a value. Use null when the receipt does not show it.',
    '- Output raw JSON only. No markdown fences, no commentary.',
  ].join('\n');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405, origin);
    }
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'origin not allowed' }, 403, origin);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'server key not configured' }, 500, origin);
    }
    if (!env.SUPABASE_ANON_KEY) {
      return json({ error: 'supabase key not configured' }, 500, origin);
    }

    // ---- 1. 로그인 확인 ----
    // Origin 헤더는 브라우저가 붙이는 것이라 프로그램으로는 얼마든지 흉내낼 수 있다.
    // 진짜 문지기는 이 토큰이다. 앱에 로그인한 사람만 통과한다.
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      return json({ error: 'sign in required' }, 401, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'bad json' }, 400, origin);
    }

    const image = body.image;
    if (!image || typeof image !== 'string') {
      return json({ error: 'image (base64) required' }, 400, origin);
    }
    if (image.length > MAX_IMAGE_B64) {
      return json({ error: 'image too large' }, 413, origin);
    }

    // ---- 2. 사용량 한도 ----
    // 토큰이 진짜인지 확인하는 일과 오늘 몇 장 썼는지 세는 일을 한 번에 한다.
    // 토큰이 가짜면 auth.uid() 가 비어서 함수가 not_signed_in 을 돌려준다.
    const quotaRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/rv_ai_use', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({ p_ledger: body.ledger_id || null }),
    });

    if (!quotaRes.ok) {
      const detail = await quotaRes.text().catch(() => '');
      return json({ error: 'could not check usage', detail: detail.slice(0, 200) }, 401, origin);
    }

    const quota = await quotaRes.json().catch(() => null);
    if (!quota || !quota.ok) {
      const reason = quota ? quota.reason : 'unknown';
      const status = reason === 'not_signed_in' ? 401 : 429;
      return json({ error: 'quota', reason: reason,
                    used: quota && quota.used, limit: quota && quota.limit }, status, origin);
    }

    // ---- 3. 인식 ----
    const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(body.media_type)
      ? body.media_type : 'image/jpeg';

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: buildPrompt(body.categories, body.countries, body.today,
                                              body.kind) },
          ],
        }],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return json({ error: 'upstream error', status: upstream.status, detail: detail.slice(0, 300) },
                  502, origin);
    }

    const data = await upstream.json();
    const text = (data.content || []).filter((b) => b.type === 'text')
                  .map((b) => b.text).join('').trim();

    // 모델이 실수로 ```json 을 붙이는 경우가 있어 한 번 벗겨낸다.
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return json({ error: 'could not parse model output', raw: cleaned.slice(0, 400) }, 502, origin);
    }

    // 오늘 몇 장 썼는지 같이 돌려줘서 앱이 보여줄 수 있게 한다
    parsed._quota = { used: quota.used, limit: quota.limit };
    return json(parsed, 200, origin);
  },
};
