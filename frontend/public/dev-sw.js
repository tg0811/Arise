// Self-destructing service worker. Development used to register a service worker at
// /dev-sw.js, and it could serve a stale cached index.html (a blank page). Browsers re-check
// this URL on navigation, find this file, and it removes itself and reloads open tabs.
// Harmless in production (nothing registers it there). Safe to delete after 2026-12.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) client.navigate(client.url);
  })());
});
