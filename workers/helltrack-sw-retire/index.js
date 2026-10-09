// Retires the old Helltrack service worker on helltrack.app.
//
// Why this exists: helltrack.app 301-redirects to trackwalk.racing, including the
// service worker script URL. Browsers refuse to update a service worker whose script
// redirects, so anyone who ever installed or visited helltrack.app is stuck on the old
// cached shell forever — HELLTRACK logo, and whatever cache.json it last saw (98 days
// old on Bryon's laptop on 2026-10-09). Refresh "works" only because the old shell's
// data fetch follows the 301 and trackwalk.racing sends Access-Control-Allow-Origin: *.
//
// This Worker answers the service worker URL with a 200 and a replacement worker that
// deletes every cache, unregisters itself, and sends open windows to trackwalk.racing.
// The browser picks it up on its next update check (at most 24h, usually next launch).
//
// This Worker REPLACES the legacy Page Rule (helltrack.app/* -> Forwarding URL 301 ->
// https://trackwalk.racing/$1). Page Rules run before Workers and can't exclude a path,
// so the rule had to go and the Worker does both jobs: the retirement script on the two
// service worker URLs, and the same 301 (path + query string kept) for everything else.

const RETIRE_SW = `
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.map(k => caches.delete(k)))
    await self.registration.unregister()
    const windows = await self.clients.matchAll({ type: 'window' })
    for (const w of windows) w.navigate('https://trackwalk.racing/')
  })())
})
`

export default {
  async fetch(request) {
    const { pathname, search } = new URL(request.url)
    // Root since 2026-05-16; under public/ before the move to root for GitHub Pages.
    if (pathname === '/service-worker.js' || pathname === '/public/service-worker.js') {
      return new Response(RETIRE_SW, {
        headers: {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
    }
    // Query string must survive: ?v= video shares and ?src= attribution depend on it.
    return Response.redirect('https://trackwalk.racing' + pathname + search, 301)
  },
}
