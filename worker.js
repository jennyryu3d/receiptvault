// worker.js — ReceiptVault 영수증 인식 프록시 (Cloudflare Worker)
//
// 왜 이게 필요한가:
//   Anthropic API 키를 앱 코드에 넣으면 브라우저에서 누구나 꺼내 쓸 수 있다.
//   그래서 키는 이 Worker 안에만(secret 으로) 두고, 앱은 이미지를 여기로 보낸다.
//   ConvoTrans 프록시와 같은 방식이다.
//
// 지켜야 할 것 (비용 사고 방지):
//   - 모델과 max_tokens 는 여기서 고정. 클라이언트가 못 바꾼다.
//   - 이미지 크기 상한. 큰 파일로 토큰 폭탄을 못 만든다.
//   - ALLOWED_ORIGINS 로 우리 사이트에서만 호출 가능.

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

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors(origin)),
  });
}

function buildPrompt(categories, today) {
  const list = (categories || [])
    .map((c) => '- ' + c.key + ': ' + c.label + (c.hint ? ' (' + c.hint + ')' : ''))
    .join('\n');

  return [
    'You are reading a purchase receipt for a small leather-craft studio in California.',
    'The image is either a photo of a paper receipt or a screenshot of an online order.',
    '',
    'Extract these fields and reply with ONE JSON object and nothing else:',
    '{',
    '  "purchased_at": "YYYY-MM-DD",           // transaction date; null if truly absent',
    '  "merchant": "store name exactly as printed, in its own script",',
    '  "merchant_en": "the store name in English",',
    '  "notes_en": "3-8 English words naming what was bought",',
    '  "total": 0.00,                           // grand total actually charged, a number',
    '  "tax": 0.00,                             // sales tax if shown, else null',
    '  "payment_method": "card|cash|transfer|other",',
    '  "category": "one key from the list below",',
    '  "splits": null,                          // see the splitting rule below',
    '  "confidence": 0.0                        // 0-1, how sure you are about total and date',
    '}',
    '',
    'Category keys:',
    list,
    '',
    'The receipt may be in Korean. The taxpayer files US taxes, so the summary that',
    'reaches her accountant must be readable in English:',
    '- "merchant" keeps the name as printed (Korean stays Korean).',
    '- "merchant_en" is the English form: use the business\'s own English name if it has',
    '  one, otherwise romanize it (한국마켓 → "Hankook Market").',
    '- "notes_en" says in plain English what was bought, from the line items',
    '  (e.g. "waxed thread and leather dye"). Leave null if the items are unreadable.',
    '- If the receipt is already in English, set merchant_en to the same value as merchant.',
    '',
    'Rules:',
    '- Amounts are numbers, no currency symbols, no thousands separators.',
    '- If the receipt is priced in a currency other than USD, still report the number as',
    '  printed and do not convert it.',
    '- "total" is the final amount charged, including tax and shipping.',
    '- If the year is missing on the receipt, assume the most recent year that makes the',
    '  date fall on or before ' + (today || 'today') + '.',
    '- Splitting rule: leave "splits" null when the whole receipt belongs to one category.',
    '  When line items clearly belong to different categories AND you can read the',
    '  per-item amounts, return',
    '    "splits": [{"category": "<key>", "amount": 0.00, "note": "short label"}, ...]',
    '  The amounts MUST add up to "total" exactly — distribute tax and shipping across',
    '  the parts in proportion, putting any leftover cent on the largest part.',
    '  Use at most 4 parts; merge small leftovers into the closest category.',
    '  If you cannot read reliable per-item amounts, return null rather than guessing.',
    '- "category" is always filled in: with the single category, or with the largest part',
    '  when you return splits.',
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
            { type: 'text', text: buildPrompt(body.categories, body.today) },
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

    return json(parsed, 200, origin);
  },
};
