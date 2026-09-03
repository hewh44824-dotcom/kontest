const CACHE_NAME = "disaster-ai-v9";
const TILE_CACHE_NAME = "disaster-ai-map-tiles-v1";
const ASSETS = [
"./index.html",
"./knowledge.json",
"./manifest.json",
"./icon-192.png",
"./icon-512.png",
"./qrcode.png",
"./shelters.html",
"./shelters.json"
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
 
// 古いキャッシュの削除(地図タイル用キャッシュは消さずに残す)
self.addEventListener("activate", (event) => {
event.waitUntil(
caches.keys().then((keys) =>
Promise.all(
keys
.filter((key) => key !== CACHE_NAME && key !== TILE_CACHE_NAME)
.map((key) => caches.delete(key))
)
)
);
self.clients.claim();
});
 
// オフライン時はキャッシュから返す(Claude APIなどオンライン専用の通信は素通しする)
self.addEventListener("fetch", (event) => {
const url = new URL(event.request.url);
 
// 地図タイル(OpenStreetMap)は別キャッシュで「見た範囲だけ」保存する
if (url.hostname.endsWith("tile.openstreetmap.org")) {
event.respondWith(
caches.open(TILE_CACHE_NAME).then((tileCache) =>
tileCache.match(event.request).then((cached) => {
if (cached) return cached;
return fetch(event.request)
.then((response) => {
if (response && response.ok) {
tileCache.put(event.request, response.clone());
}
return response;
})
.catch(() => {
// オフラインでまだ見たことのないタイルは、透明な1x1画像を代わりに返す
return new Response(
new Uint8Array([71,73,70,56,57,97,1,0,1,0,128,0,0,255,255,255,0,0,0,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,1,68,0,59]),
{ headers: { "Content-Type": "image/gif" } }
);
});
})
)
);
return;
}
 
// 自分のオリジン以外(Claude APIなど)へのリクエストはキャッシュ対象外、素通し
if (url.origin !== self.location.origin) {
return;
}
 
// shelters.json / shelters.html は更新頻度が高いデータなので network-first
// (オンライン時は常に最新を取りに行き、取れた分は次回オフライン用にキャッシュも更新する)
if (url.pathname.endsWith("shelters.json") || url.pathname.endsWith("shelters.html")) {
event.respondWith(
fetch(event.request)
.then((response) => {
const clone = response.clone();
caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
return response;
})
.catch(() => caches.match(event.request))
);
return;
}
 
// それ以外(index.htmlや画像など、滅多に変わらないもの)は従来通り cache-first
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
 