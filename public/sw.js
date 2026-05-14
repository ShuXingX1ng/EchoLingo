// EchoLingo Service Worker
const CACHE_NAME = "echolingo-v1";
const STATIC_ASSETS = [
  "/",
  "/practice",
  "/history",
  "/settings",
  "/practice/setup",
];

// 安装事件 - 缓存静态资源
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 激活事件 - 清理旧缓存
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截 - 网络优先策略
self.addEventListener("fetch", (event) => {
  // 跳过非 GET 请求
  if (event.request.method !== "GET") return;

  // 跳过 API 请求
  if (event.request.url.includes("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 如果请求成功，缓存响应
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 如果网络失败，尝试从缓存获取
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // 如果缓存中也没有，返回离线页面
          return caches.match("/");
        });
      })
  );
});
