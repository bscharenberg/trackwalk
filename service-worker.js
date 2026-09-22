const CACHE_NAME = 'trackwalk-v30'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  // The icons manifest.json actually names — pre-caching a file the manifest does not
  // reference did nothing for the install prompt, which is the whole point on a QR-code launch.
  '/icon-192.png',
  '/icon-512.png',
  '/public/cache.json',
  '/public/calendar.json',
  '/public/results/index.json',
  '/public/riders.json',
  '/public/directory.json',
  '/public/watch.json',
]

self.addEventListener('install', event => {
  event.waitUntil(
    // addAll is all-or-nothing; cache each asset separately so one bad fetch
    // (cache.json mid-refresh, say) can't abort the whole install.
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})))
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // All app data: stale-while-revalidate. Paint instantly from cache, refresh in the
  // background — a returning user no longer waits on the network to see anything.
  // A cache-busted request (?t=, from Retry or the background revalidate) skips the
  // stale copy, but still stores under the clean path so it refreshes the same entry
  // rather than piling up one copy per app open.
  if (url.pathname.endsWith('cache.json') || url.pathname.endsWith('riders.json') ||
      url.pathname.endsWith('calendar.json') ||
      url.pathname.endsWith('directory.json') || url.pathname.endsWith('watch.json') ||
      url.pathname.includes('/public/results/')) {
    const cacheKey = url.origin + url.pathname
    const wantsFresh = url.search !== ''
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(cacheKey)
        const network = fetch(event.request).then(res => {
          if (res.ok) cache.put(cacheKey, res.clone())
          return res
        })
        if (wantsFresh) return network.catch(err => cached || Promise.reject(err))
        network.catch(() => {})            // revalidation failure is not the caller's problem
        return cached || network
      })
    )
    return
  }

  // App shell: network-first with a short timeout, falling back to cache.
  //
  // This was cache-first, which left every deploy one launch behind — including the launch
  // where someone opens the app looking for the change that just shipped. Worse, the lag is
  // invisible: the app looks fine, it is just old. 31KB gzipped is worth paying to know you
  // are running current code, and the timeout means a bad connection still opens instantly
  // from cache rather than hanging on the network.
  //
  // The timeout was 2500ms, which is the whole budget for a launch that should feel instant.
  // It is paid in full on a cold PWA open while the phone's radio is still waking up, and the
  // reader stares at nothing the entire time. 1000ms is comfortably more than the shell needs
  // on any working connection (measured ~56ms through the SW on wifi, ~200ms TTFB cold), so in
  // practice this only changes what happens on a bad one: fall back to cache a second and a
  // half sooner. The cost is that a genuinely slow-but-alive connection now shows the previous
  // shell and picks up the new one next launch, which is the trade cache-first made all the
  // time and this makes only under duress.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match('/index.html')
        try {
          const res = await Promise.race([
            fetch(event.request),
            new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 1000)),
          ])
          if (res && res.ok) {
            cache.put('/index.html', res.clone())
            cache.put('/', res.clone())
          }
          return res
        } catch (err) {
          if (cached) return cached
          throw err
        }
      })
    )
    return
  }

  // Everything else static: cache first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  )
})
