/**
 * CodeB PWA Service Worker
 * 오프라인 지원 및 캐싱 전략
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `codeb-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `codeb-dynamic-${CACHE_VERSION}`;
const SYNC_TAG = 'sync-participations';

// 정적 자산 (항상 캐시)
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// 캐시하지 않을 경로
const CACHE_EXCLUDE = [
  '/api/',
  '/admin/',
  '/__remix_dev__',
  '/socket.io',
];

// Install: 정적 자산 캐싱
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error('[SW] Failed to cache static assets:', err);
      })
  );
});

// Activate: 이전 캐시 정리
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');

  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map((key) => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: 네트워크 전략
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 같은 origin만 처리
  if (url.origin !== location.origin) {
    return;
  }

  // 제외할 경로
  if (CACHE_EXCLUDE.some((path) => url.pathname.startsWith(path))) {
    return;
  }

  // API 요청: Network Only
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // POST 등 비-GET 요청은 캐시하지 않음
  if (request.method !== 'GET') {
    return;
  }

  // 네비게이션 요청: Network First, Fallback to Offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/offline'))
    );
    return;
  }

  // 정적 자산 (이미지, 폰트, CSS, JS): Cache First
  if (
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'style' ||
    request.destination === 'script'
  ) {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) {
            // 백그라운드에서 업데이트
            fetch(request).then((response) => {
              if (response && response.status === 200) {
                caches.open(DYNAMIC_CACHE).then((cache) => {
                  cache.put(request, response);
                });
              }
            }).catch(() => {});

            return cached;
          }

          return fetch(request).then((response) => {
            if (response && response.status === 200) {
              const responseClone = response.clone();
              caches.open(DYNAMIC_CACHE).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          });
        })
    );
    return;
  }

  // 기타: Network First
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Background Sync: 오프라인 참여 동기화
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);

  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingParticipations());
  }
});

async function syncPendingParticipations() {
  try {
    // IndexedDB에서 대기 중인 참여 가져오기
    const db = await openParticipationsDB();
    const pending = await getAllPendingParticipations(db);

    for (const participation of pending) {
      try {
        const response = await fetch(`/api/events/${participation.eventId}/participate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(participation),
        });

        if (response.ok) {
          await deleteParticipation(db, participation.id);
        }
      } catch (err) {
        console.error('[SW] Failed to sync participation:', err);
      }
    }
  } catch (err) {
    console.error('[SW] Sync failed:', err);
  }
}

// IndexedDB 헬퍼 함수
function openParticipationsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('codeb-participations', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending')) {
        db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getAllPendingParticipations(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readonly');
    const store = tx.objectStore('pending');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deleteParticipation(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite');
    const store = tx.objectStore('pending');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Push Notification
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data = {
    title: '알림',
    body: '새로운 알림이 있습니다',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    url: '/',
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (err) {
    console.error('[SW] Failed to parse push data:', err);
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      vibrate: [100, 50, 100],
      data: { url: data.url },
      actions: [
        { action: 'open', title: '열기' },
        { action: 'close', title: '닫기' },
      ],
    })
  );
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 이미 열린 창이 있으면 포커스
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // 없으면 새 창 열기
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Message Handler (클라이언트와 통신)
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
});
