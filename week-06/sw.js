// 오늘 급식 앱 서비스 워커
// 앱 화면(파일)을 저장해 두어서 인터넷이 끊겨도 앱이 열리게 한다.
// 급식 정보는 앱(index.html)이 따로 저장해 두었다가 보여 준다.
const CACHE = "meal-app-v1";
const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 같은 주소의 파일만 다룬다: 먼저 인터넷에서 새로 받고, 안 되면 저장해 둔 것을 쓴다.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(
          (hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())
        ).then((res) => res || Response.error())
      )
  );
});
