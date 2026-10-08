// Daybook's service worker: lets the app open with no connection.
//
// Why: the pregnancy blood pressure alert (WG-PLAN-HEALTH-002, workstream 9)
// must work offline, and until now Daybook couldn't even start without a
// network. This keeps a copy of the app itself — the page, its one script and
// stylesheet, the icons — on the phone. It never caches health data: calls to
// Supabase (the database, sign-in, Sparky) go straight to the network.
//
//   The page (index.html)  network first; the saved copy only when offline.
//                          So a new deploy is picked up as soon as the phone
//                          is online, and the "new version" banner still
//                          compares against the live page.
//   /assets/*              saved after the first load, including the parts
//                          the app loads only when needed (the route map).
//                          Vite puts a hash in every file name, so a saved copy
//                          never goes stale; files the current page no longer
//                          uses are dropped.
//   icons, manifest        served from the copy, refreshed in the background.
//
// The file name never changes, and it doesn't need to: it reads the asset
// names from whatever index.html it fetches.

const CACHE = 'daybook-app'
const SHELL = ['/', '/manifest.webmanifest', '/sparky.png', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon-64.png']
const ASSET = /\/assets\/[^"' )]+\.(?:js|css)/g

// Save a page and every asset it names, and the assets those name in turn
// (parts of the app loaded only when needed, like the route map); drop assets
// no longer named.
const CHUNK = /(?:assets\/|\.\/)([A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.(?:js|css))/g
async function keepPage(res) {
  const cache = await caches.open(CACHE)
  const html = await res.clone().text()
  const wanted = new Set(html.match(ASSET) || [])
  await cache.put('/', res)
  const queue = [...wanted]
  while (queue.length) {
    const path = queue.shift()
    let r = await cache.match(path)
    if (!r) {
      r = await fetch(path)
      if (!r.ok) continue
      await cache.put(path, r.clone())
    }
    if (!path.endsWith('.js')) continue
    for (const m of (await r.text()).matchAll(CHUNK)) {
      const more = `/assets/${m[1]}`
      if (!wanted.has(more)) { wanted.add(more); queue.push(more) }
    }
  }
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname
    if (path.startsWith('/assets/') && !wanted.has(path)) await cache.delete(req)
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(SHELL.filter((p) => p !== '/'))
    const page = await fetch('/', { cache: 'no-store' })
    if (page.ok) await keepPage(page)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase, fonts, anything else: untouched

  // The page, by any path (the app has one page; vercel.json rewrites to it).
  if (req.mode === 'navigate' || (url.pathname === '/' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res.ok && req.mode === 'navigate') event.waitUntil(keepPage(res.clone()))
        return res
      } catch {
        const saved = await caches.match('/')
        return saved || new Response('Daybook needs a connection the first time it opens.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      }
    })())
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const saved = await caches.match(req)
      if (saved) return saved
      const res = await fetch(req)
      if (res.ok) {
        const copy = res.clone()
        event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)))
      }
      return res
    })())
    return
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith((async () => {
      const saved = await caches.match(req)
      const fresh = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone() // before the page reads the body
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      }).catch(() => saved)
      return saved || fresh
    })())
  }
})
