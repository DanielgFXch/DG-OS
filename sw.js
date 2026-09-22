const CACHE='dgos-personal-shell-28';
const ASSETS=['./','./index.html','./styles.css?v=0.45.3','./wow.css?v=0.37.1','./personal.css?v=0.52.0','./social.css?v=0.54.0','./navigation.css?v=0.51.0','./mobile.css?v=0.46.3','./personal.js?v=0.53.2','./social.js?v=0.54.0','./navigation.js?v=0.46.0','./weather.js?v=0.46.2','./marketBrain.js','./app.js?v=0.46.3','./manifest.webmanifest','./icon-192.png','./icon-512.png',
  './fonts/chakra-petch-500.woff2','./fonts/chakra-petch-600.woff2','./fonts/chakra-petch-700.woff2',
  './fonts/jetbrains-mono-400.woff2','./fonts/jetbrains-mono-500.woff2','./fonts/jetbrains-mono-700.woff2'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('dgos-')).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

async function networkFirst(request){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response&&response.ok) cache.put(request,response.clone());
    return response;
  }catch(_){
    const cached=await cache.match(request);
    if(cached) return cached;
    throw _;
  }
}

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;

  // App shell must prefer the live deployment so iPhone/PWA users do not
  // remain stuck on an old DG OS version after a successful Pages deploy.
  if(
    e.request.mode==='navigate' ||
    e.request.destination==='document' ||
    e.request.destination==='script' ||
    e.request.destination==='style'
  ){
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Fonts/images remain cache-first for fast startup and offline resilience.
  e.respondWith(
    caches.open(CACHE)
      .then(c=>c.match(e.request))
      .then(r=>r||fetch(e.request))
  );
});
