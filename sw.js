const CACHE='dgos-personal-shell-53';
const ASSETS=['./','./index.html','./styles.css?v=0.45.3','./wow.css?v=0.37.1','./personal.css?v=0.57.1','./social.css?v=0.61.2','./navigation.css?v=0.51.0','./mobile.css?v=0.46.3','./jarvis-visuals.css?v=0.56.0','./trading-command.css?v=0.57.0','./ambient-glass.css?v=0.58.1','./jarvis-os-v2.css?v=0.59.0','./jarvis-replies.js?v=1','./jarvis-dashboard.js?v=3','./jarvis-dashboard.css?v=1','./jarvis-weather-outfit.js?v=1','./jarvis-weather-ui.js?v=1','./jarvis-weather.css?v=1','./premium-ui.css?v=1.0.1','./home-compact.css?v=1','./health-premium.css?v=1.0.0','./jarvis-premium.css?v=1','./assets/jarvis-nightscape.svg','./premium-ui.js?v=1.0.1','./personal.js?v=0.59.12','./whoop-sleep.css?v=1','./whoop-sleep-analytics.js?v=1','./whoop-sleep-ui.js?v=2','./jarvis-microphone.js?v=2','./jarvis-native-voice.js?v=3','./jarvis-voice.css?v=5','./jarvis-voice.js?v=14','./jarvis-brain.js?v=3','./jarvis-premium.js?v=1','./social.js?v=0.61.2','./navigation.js?v=0.46.0','./trading-command.js?v=0.57.0','./weather.js?v=0.47.0','./marketBrain.js','./app.js?v=0.46.3','./manifest.webmanifest','./icon-192.png','./icon-512.png',
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
