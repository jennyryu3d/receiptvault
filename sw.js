// sw.js — 홈 화면 설치를 가능하게 하는 최소 서비스워커.
// 일부러 network-first 로 짰다: 항상 최신 파일을 먼저 받아오고,
// 오프라인일 때만 캐시를 꺼내 쓴다. 그래야 "코드를 고쳤는데 태블릿에서 안 바뀌는" 일이 없다.

const CACHE = 'receiptvault-v1';

self.addEventListener('install', (e) => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // GET 이 아니거나 다른 도메인(Supabase, Worker, CDN) 요청은 건드리지 않는다.
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
