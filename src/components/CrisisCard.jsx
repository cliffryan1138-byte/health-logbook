import { useEffect, useRef, useState } from 'react'
import { onCrisis, mentionsCrisis } from '../lib/crisis'

// The 988 crisis card (approved safety flow, 2026-10-08). Mounted once, above
// everything. Opens on PHQ-9 question 9, on self-harm words typed into ANY
// text box in Daybook, and on Sparky's crisis flag. The text and numbers ship
// with the app, so it works offline. Tapping outside doesn't close it;
// "Back to Daybook" does. Nothing about it is stored or sent anywhere.
export default function CrisisCard() {
  const [open, setOpen] = useState(false)
  const shownFor = useRef(new WeakMap()) // text box -> whether its current text already opened the card
  const back = useRef(null)

  useEffect(() => onCrisis(() => setOpen(true)), [])

  // Every text box, everywhere: a pause in typing that leaves self-harm words
  // in the box opens the card once (not again on every following keystroke).
  useEffect(() => {
    let timer
    const onInput = (e) => {
      const el = e.target
      if (!(el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|search)?$/.test(el.type)))) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const hit = mentionsCrisis(el.value)
        if (hit && !shownFor.current.get(el)) setOpen(true)
        shownFor.current.set(el, hit)
      }, 700)
    }
    document.addEventListener('input', onInput, true)
    return () => { document.removeEventListener('input', onInput, true); clearTimeout(timer) }
  }, [])

  useEffect(() => { if (open) back.current?.focus() }, [open])
  if (!open) return null

  return (
    <div className="crisis-scrim" role="dialog" aria-modal="true" aria-labelledby="crisis-title">
      <div className="crisis">
        <h2 id="crisis-title">You don’t have to go through this alone</h2>
        <p>If you’re thinking about suicide or hurting yourself, you can talk to someone right now. It’s free and confidential, any time.</p>
        <div className="crisis-actions">
          <a className="btn" href="tel:988">Call 988</a>
          <a className="btn ghost" href="sms:988">Text 988</a>
        </div>
        <p className="crisis-vet"><b>Veterans:</b> call 988, then press 1. Or text <a href="sms:838255">838255</a>.</p>
        <p className="crisis-vet"><a href="https://chat.988lifeline.org" target="_blank" rel="noreferrer">Chat online with the 988 Lifeline</a></p>
        <p className="crisis-911">If you are in danger right now, call 911.</p>
        <a className="btn crit" href="tel:911">Call 911</a>
        <button ref={back} type="button" className="crisis-back" onClick={() => setOpen(false)}>Back to Daybook</button>
      </div>
    </div>
  )
}
