const CACHE='dgos-personal-shell-1';
const ASSETS=['./','./index.html','./styles.css','./wow.css?v=0.37.1','./personal.css','./personal.js','./marketBrain.js','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png',
  './fonts/chakra-petch-500.woff2','./fonts/chakra-petch-600.woff2','./fonts/chakra-petch-700.woff2',
  './fonts/jetbrains-mono-400.woff2','./fonts/jetbrains-mono-500.woff2','./fonts/jetbrains-mono-700.woff2'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE && k.startsWith('dgos-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(r=>r||fetch(e.request)));
});
