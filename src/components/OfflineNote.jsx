import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

// Says plainly what works with no connection. Daybook opens offline
// (public/sw.js) so the pregnancy blood pressure check works, but the log
// itself lives in the database: only blood pressure readings wait on the
// phone and save later (lib/pregnancy.js, saveVitals).
export default function OfflineNote() {
  const { session } = useAuth()
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (online && !session?.offline) return null
  return (
    <div className="offline-note screen-only" role="status">
      <b>No connection.</b> Your log can’t load right now. Blood pressure readings you add are kept on this phone and saved when you’re back online; other entries need a connection.
    </div>
  )
}
