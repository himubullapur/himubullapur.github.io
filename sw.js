const CACHE_NAME = 'dsi-placement-v1.0.0';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './DSi.png',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event - cache resources
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('Cache failed:', err);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        return fetch(event.request).then(response => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch(() => {
        // If both cache and network fail, show offline page
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      })
  );
});

// Push notification event
self.addEventListener('push', event => {
  console.log('Push notification received:', event);
  
  let notificationData = {
    title: 'DSI Placement Portal',
    body: 'New job opportunity available!',
    icon: './DSi.png',
    badge: './DSi.png',
    tag: 'job-notification',
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200],
    data: {
      url: './',
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'view',
        title: 'View Jobs',
        icon: './DSi.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// Handle notification click for iOS
self.addEventListener('notificationclick', event => {
  console.log('Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Default action or 'view' action
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // If app is not open, open it
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});


// Background sync for offline actions
self.addEventListener('sync', event => {
  console.log('Background sync:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Handle any pending actions when back online
  console.log('Performing background sync...');
}

// Message event for communication with main thread
self.addEventListener('message', event => {
  console.log('Service Worker received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
