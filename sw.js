
const CACHE='dgos-alpha-v011';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png',
  './fonts/chakra-petch-500.woff2','./fonts/chakra-petch-600.woff2','./fonts/chakra-petch-700.woff2',
  './fonts/jetbrains-mono-400.woff2','./fonts/jetbrains-mono-500.woff2','./fonts/jetbrains-mono-700.woff2'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
