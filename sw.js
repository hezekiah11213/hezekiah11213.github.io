// ✅ 版本號：更新此數字即可強制所有使用者重新快取
const CACHE_VERSION = 'v2';
const CACHE_NAME = `muguo-pwa-cache-${CACHE_VERSION}`;

// ✅ 核心靜態資源：這份 index.html 所使用到的所有外部 CDN、字體與圖標
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  // 核心圖片與 Logo
  'https://fkkayjsaadqmbslwpwzg.supabase.co/storage/v1/object/public/logo/logo.png',
  // 外部前端框架與套件 CDN
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js',
  'https://unpkg.com/lucide@0.287.0/dist/umd/lucide.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  // 溫柔可愛感字體
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;600;700;900&family=Zen+Maru+Gothic:wght@500;700;900&display=swap'
];

// 1. 安裝階段 (Install)：預先快取所有關鍵靜態資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      // 讓剛安裝的 SW 立即進入啟用狀態
      return self.skipWaiting();
    })
  );
});

// 2. 啟用階段 (Activate)：清理舊版本的快取，確保客戶端更新
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      // 讓 SW 立即控制所有開啟的網頁分頁
      return self.clients.claim();
    })
  );
});

// 3. 請求攔截 (Fetch)
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // ⚠️ 排除條款處理：Supabase API、驗證與資料庫提交，絕對不可快取，直接走網路
  if (
    event.request.url.includes('supabase.co') && 
    !event.request.url.includes('/storage/v1/object/public/logo/logo.png') // 排除 Logo 圖片
  ) {
    return; // 讓瀏覽器直接處理，不攔截
  }

  // ⚠️ 表單提交 (POST) 無法進行標準快取，直接交給網路
  if (event.request.method !== 'GET') {
    return;
  }

  // 💡 針對網頁主體與 Manifest (Network First 策略)：
  // 優先抓取最新表單與合約內容，網路斷線時才使用快取墊底
  if (
    requestUrl.origin === self.location.origin && 
    (requestUrl.pathname === '/' || requestUrl.pathname.includes('index.html') || requestUrl.pathname.includes('manifest.json'))
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // 抓到最新頁面後，順便更新快取
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // 網路不通（離線狀態）時，吐出快取版本
          return caches.match(event.request);
        })
    );
    return;
  }

  // 💡 針對外部 CDN 與靜態資源 (Cache First 策略)：
  // 優先從快取載入 Tailwind、字體、簽名套件，秒開頁面並節省網路流量
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        // 如果請求成功，動態加入快取（例如未來新增的其他外部小圖標或字體）
        if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });

        return response;
      });
    })
  );
});

// 4. 監聽 index.html 發過來的 SKIP_WAITING 指令，達到「偵測到新版本時能主動重新整理」
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});