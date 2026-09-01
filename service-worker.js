const CACHE_NAME = "disaster-ai-v3";
const ASSETS = [
  "./index.html",
  "./knowledge.json",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// インストール時に必要なファイルを可能な限りキャッシュ
// (addAllだと1つでも失敗すると全部失敗するため、1つずつ個別に試す)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`キャッシュ失敗(スキップ): ${url}`, err);
          })
        )
      );
    })
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

// オフライン時はキャッシュから返す(Claude APIなどオンライン専用の通信は素通しする)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 自分のオリジン以外(Claude APIなど)へのリクエストはキャッシュ対象外、素通し
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(async () => {
          // オフラインでキャッシュにも無い場合のフォールバック。
          // ページ遷移(URLを直接開いた/リロードした等)なら、
          // キャッシュ済みのメインページ(disaster-ai.html)を代わりに返す。
          if (event.request.mode === "navigate") {
            const fallback = await caches.match("./index.html");
            if (fallback) return fallback;
          }
          // それでも無ければ、undefinedを返さず明示的な503エラーを返す
          // (respondWithにundefinedを渡すとERR_FAILEDになるため)
          return new Response(
            "オフラインのため、このファイルはまだキャッシュされていません。",
            { status: 503, statusText: "Offline", headers: { "Content-Type": "text/plain; charset=utf-8" } }
          );
        });
    })
  );
});
