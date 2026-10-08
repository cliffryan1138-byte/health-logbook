// Daybook moved to daybook.wastegate.ai (2026-10-08; WG-IDR-0017). The old
// addresses still serve the app, and send people on.
//
// Each address is its own site to the browser, with its own sign-in and its
// own saved copies, so two things are guarded:
//   * A blood pressure reading waiting to upload (lib/pregnancy.js outbox)
//     lives only on the old address. If one is waiting, Daybook opens here,
//     uploads it, then moves (Dashboard).
//   * Offline, the new address may not be saved on the phone yet, so nobody is
//     moved while offline; the old address keeps working from its own copy.
// The path, query and #hash go along, so sign-in and password-reset links
// that land on an old address still work.

export const HOME = 'daybook.wastegate.ai'
const OLD = ['healthtrack.wastegate.ai', 'healthtracker.wastegate.ai', 'health-logbook.wastegate.ai', 'app.ht.wastegate.ai']

export const onOldAddress = () => OLD.includes(location.hostname.replace(/\.+$/, ''))

function readingsWaiting() {
  try { return JSON.parse(localStorage.getItem('lb_outbox') || '[]').length } catch { return 0 }
}

// Move now if it's safe to; returns true when the page is leaving.
export function moveIfReady() {
  if (!onOldAddress() || navigator.onLine === false || readingsWaiting()) return false
  location.replace(`https://${HOME}${location.pathname}${location.search}${location.hash}`)
  return true
}
