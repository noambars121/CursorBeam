// Service Worker for CursorBeam PWA
// Handles Web Push notifications

console.log('[SW] Service Worker loaded');

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(self.clients.claim());
});

// Handle push events
self.addEventListener('push', (event) => {
  console.log('[SW] 🔔 Push event received!');
  console.log('[SW] 🔔 Event data:', event.data);
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
      console.log('[SW] 🔔 Parsed JSON:', data);
    } catch (e) {
      console.log('[SW] 🔔 Not JSON, using text');
      data = { title: 'Cursor Finished', body: event.data.text() };
    }
  } else {
    console.log('[SW] 🔔 No event data, using default');
  }
  
  const title = data.title || 'Cursor Finished';
  const options = {
    body: data.body || 'Response complete',
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    tag: 'cursor-finished',
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
    data: data
  };
  
  console.log('[SW] 🔔 Showing notification:', title, options);
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('[SW] ✅ Notification shown successfully');
      })
      .catch((err) => {
        console.error('[SW] ❌ Notification failed:', err);
      })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if none exists
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
