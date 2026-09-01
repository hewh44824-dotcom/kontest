const CACHE_NAME = "disaster-ai-v1";
const ASSETS = [
  "./disaster-ai.html",
  "./knowledge.json",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// インストール時に必要なファイルを全部キャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 古いキャッシュの削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// オフライン時はキャッシュから返す(Gemini APIなどオンライン専用の通信は素通しする)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 自分のオリジン以外(Gemini APIなど)へのリクエストはキャッシュ対象外、素通し
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
          .catch(() => cached)
      );
    })
  );
});