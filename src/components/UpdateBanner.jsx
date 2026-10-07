import { useEffect, useState } from 'react'

// "A new version is ready." An iPhone Home Screen app doesn't reload when its
// icon is tapped — it resumes the page it had — so testers kept using an old
// copy for days after an update, unless they swiped the app away.
//
// This compares the app's own script (the hashed /assets/index-….js Vite
// builds) with the one the live index.html names. They differ only after a
// deploy. It checks when the app comes back to the screen and every 30
// minutes while it's open, and offers a reload rather than forcing one, so
// nobody loses an entry they're halfway through.

const EVERY_MS = 30 * 60 * 1000
const BUNDLE = /\/assets\/index-[\w-]+\.js/

function running() {
  const s = [...document.scripts].find((x) => BUNDLE.test(x.src))
  return s ? s.src.match(BUNDLE)[0] : null
}

async function live() {
  const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  return (await res.text()).match(BUNDLE)?.[0] ?? null
}

export default function UpdateBanner() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const mine = running()
    if (!mine) return undefined // development server: nothing hashed to compare
    let last = 0
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 60 * 1000) return
      last = Date.now()
      try {
        const now = await live()
        if (now && now !== mine) setReady(true)
      } catch { /* offline: try again next time */ }
    }
    const first = setTimeout(check, 5000)
    const timer = setInterval(check, EVERY_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      clearTimeout(first); clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  if (!ready) return null
  return (
    <div className="update-banner screen-only" role="status">
      <span>A new version of Daybook is ready.</span>
      <button type="button" onClick={() => window.location.reload()}>Update</button>
    </div>
  )
}
