import { useEffect, useState } from 'react'

// Offers "add to home screen" once, when the browser says it is installable.
//
// RECOVERY NOTE: rebuilt — the original was not recoverable.

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('lb_install_dismissed') === '1' } catch { return false }
  })

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!deferred || hidden) return null

  const dismiss = () => {
    setHidden(true)
    try { localStorage.setItem('lb_install_dismissed', '1') } catch { /* private mode */ }
  }

  return (
    <div className="card" style={{ position: 'fixed', left: 16, right: 16, bottom: 86, maxWidth: 420, margin: '0 auto', zIndex: 25 }}>
      <p style={{ margin: 0, fontSize: 14 }}>Add Logbook to your home screen for one-tap logging.</p>
      <div className="actions">
        <button className="btn ghost" onClick={dismiss}>Not now</button>
        <button className="btn" onClick={async () => { deferred.prompt(); await deferred.userChoice; dismiss() }}>Add</button>
      </div>
    </div>
  )
}
