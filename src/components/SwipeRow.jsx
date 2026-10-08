import { useRef, useState } from 'react'

// One Logbook entry you can swipe, iPhone-Mail style:
//   swipe left  -> a red Remove button slides into view; tap it to remove
//   swipe right -> an Edit button (only for kinds with a form to edit them)
// A swipe only reveals the button; nothing happens until it's tapped, so a
// stray swipe never removes anything. Tapping the entry shows the same
// choices inline (Edit, Remove, then Remove for sure) for mouse, keyboard
// and screen-reader users. Vertical scrolling is left to the page.

const W = 96 // width of a revealed button, px

export default function SwipeRow({ children, canEdit, onEdit, onRemove }) {
  const [dx, setDx] = useState(0)
  const [revealed, setRevealed] = useState(null) // 'remove' | 'edit' | null
  const [dragging, setDragging] = useState(false)
  const [tapped, setTapped] = useState(false)
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const drag = useRef(null)

  const settle = (to) => {
    setRevealed(to)
    setDx(to === 'remove' ? -W : to === 'edit' ? W : 0)
  }

  function onTouchStart(e) {
    const t = e.touches[0]
    drag.current = { x: t.clientX, y: t.clientY, base: dx, axis: null }
  }
  function onTouchMove(e) {
    const d = drag.current
    if (!d) return
    const t = e.touches[0]
    const mx = t.clientX - d.x, my = t.clientY - d.y
    if (!d.axis) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) { d.axis = 'x'; setDragging(true); setTapped(false) }
      else if (Math.abs(my) > 8) d.axis = 'y'
    }
    if (d.axis !== 'x') return
    setDx(Math.max(-W * 1.3, Math.min(canEdit ? W * 1.3 : 0, d.base + mx)))
  }
  function onTouchEnd() {
    const d = drag.current
    drag.current = null
    if (!d || d.axis !== 'x') return
    setDragging(false)
    if (dx < -W / 2) settle('remove')
    else if (dx > W / 2 && canEdit) settle('edit')
    else settle(null)
  }

  function tap() {
    if (revealed) { settle(null); return }
    setTapped((v) => !v); setSure(false); setErr('')
  }

  async function remove() {
    setBusy(true); setErr('')
    try { await onRemove() } catch (x) { setErr(x.message || 'Couldn’t remove it. Check your connection.'); settle(null); setTapped(true) }
    finally { setBusy(false) }
  }
  function edit() { settle(null); setTapped(false); onEdit() }

  return (
    <li className={`swipe${tapped ? ' picked' : ''}`}>
      <div className="swipe-under" aria-hidden={!revealed}>
        {dx > 0 && canEdit && <button type="button" className="swipe-edit" tabIndex={revealed === 'edit' ? 0 : -1} onClick={edit}>Edit</button>}
        <span />
        {dx < 0 && <button type="button" className="swipe-remove" tabIndex={revealed === 'remove' ? 0 : -1} disabled={busy} onClick={remove}>{busy ? '…' : 'Remove'}</button>}
      </div>
      <div className={`swipe-row${dragging ? ' dragging' : ''}`} style={{ transform: `translateX(${dx}px)` }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        <div className="swipe-tap" role="button" tabIndex={0} aria-expanded={tapped} onClick={tap}
          onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); tap() } }}>
          {children}
        </div>
        {tapped && (
          <div className="feed-actions">
            {canEdit && <button type="button" className="chip" onClick={edit}>Edit</button>}
            {!sure
              ? <button type="button" className="chip" onClick={() => setSure(true)}>Remove</button>
              : <button type="button" className="chip remove" disabled={busy} onClick={remove}>{busy ? 'Removing…' : 'Remove for sure'}</button>}
            <span className="note-inline">{canEdit ? 'Swipe left to remove, right to edit. ' : 'Swipe left to remove. '}Earlier versions stay in your record’s change history.</span>
          </div>
        )}
        {err && <p className="err">{err}</p>}
      </div>
    </li>
  )
}
