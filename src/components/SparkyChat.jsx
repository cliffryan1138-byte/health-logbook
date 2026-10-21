import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from '../lib/icons'
import { describe } from '../lib/entries'
import { addMed, logDose, matchMed, medLine } from '../lib/meds'
import { shrinkToJpeg } from '../lib/images'
import { checkCrisis, openCrisis } from '../lib/crisis'
import { checkReading, checkSymptom } from '../lib/pregnancy'
import { SR, TTS, newRecognizer, takeListening, micProblem } from '../lib/voice'

// Talk or type to Sparky. Testers asked for a microphone to speak back and
// forth, and a chat. Both are this one sheet:
//
//   * Type and press send, or tap the mic and talk. After a spoken question
//     Sparky answers out loud, then listens again — hands-free until you tap
//     the mic off, close the sheet, or say nothing.
//   * Ask about your log ("how many headaches this month?"), or tell Sparky
//     what happened ("took two Advil at noon"). Sparky drafts the entry; you
//     tap Save. Nothing is written without that tap.
//
// Photos: "Take a picture" opens this sheet with the photos already sent, and
// the camera button here sends more. Up to MAX_PHOTOS can go in one message
// (screenshots of one page, a label front and back), read together. Sparky works out what each photo shows —
// a meal, a medicine label, a meter, a rash, paper notes — and drafts what
// fits. Photos are shrunk on the phone and never stored; the entries you save
// are the record.
//
// The conversation lives only in this sheet. Closing it clears it; the record
// is what you saved. Speech uses the browser's own recognition and voice
// (lib/voice); browsers without them can still type, and every way listening
// can fail says so in plain words instead of going quiet.

const TABLE = { meals: 'meals', vitals: 'vitals', exercise: 'exercise', symptoms: 'symptoms', doses: 'med_doses', medications: 'medications' }

// A draft time ("2026-10-07T12:00", local) if it's sane, else now.
function when(at) {
  const d = at ? new Date(at) : null
  if (!d || Number.isNaN(d.getTime()) || d > new Date(Date.now() + 5 * 60000)) return new Date().toISOString()
  return d.toISOString()
}

// "2026-10-07T14:05 (Tuesday)" in the person's own time zone.
function localClock() {
  const d = new Date()
  const off = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  return `${off} (${d.toLocaleDateString(undefined, { weekday: 'long' })})`
}

// Turn the model's drafts into one flat list of { kind, row, title, stats }.
const MAX_PHOTOS = 6 // per message, and in all per request: sparky-chat's limits

function flatten(drafts, photo) {
  const out = []
  for (const kind of Object.keys(TABLE)) {
    for (const row of drafts?.[kind] || []) {
      if (kind === 'medications') {
        out.push({ kind, row, title: `Add ${row.name} to your list`, stats: medLine(row) })
      } else {
        const d = describe(kind === 'doses' ? 'med_doses' : kind, row)
        out.push({ kind, row, photo, title: d.title, stats: d.stats })
      }
    }
  }
  return out
}

const LABEL = { meals: 'Meal', vitals: 'Vitals', exercise: 'Exercise', symptoms: 'Symptom', doses: 'Medicine', medications: 'Medication list' }

export default function SparkyChat({ profile, meds, onLogged, onClose, listenFirst, firstPhotos }) {
  const [msgs, setMsgs] = useState([]) // { role, text, drafts?: [{..., saved}] }
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')
  const inputRef = useRef(null)
  const [listening, setListening] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const [mute, setMute] = useState(() => { try { return localStorage.getItem('lb_sparky_mute') === '1' } catch { return false } })
  const recRef = useRef(null)
  const handsRef = useRef(false)
  const muteRef = useRef(mute)
  const msgsRef = useRef(msgs)
  const endRef = useRef(null)
  const camRef = useRef(null)
  const sentFirst = useRef(false)
  const alive = useRef(true)

  msgsRef.current = msgs
  handsRef.current = handsFree
  muteRef.current = mute

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [msgs, busy])
  useEffect(() => { try { localStorage.setItem('lb_sparky_mute', mute ? '1' : '0') } catch { /* private mode */ } }, [mute])
  useEffect(() => {
    // Once only: React's development mode runs mount effects twice, and a
    // second start would come too late for an iPhone.
    if (sentFirst.current) return
    sentFirst.current = true
    if (firstPhotos?.length) sendPhotos(firstPhotos)
    else if (listenFirst) {
      // The dock's tap already started the microphone (lib/voice); take it over.
      const started = takeListening()
      if (started) { setHandsFree(true); listen(started) }
      else if (!SR) { setErr(micProblem('unsupported')); inputRef.current?.focus() }
      // Opened without a tap-started mic: try, and ask for a tap if refused.
      else { setHandsFree(true); listen(null, false) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Nothing a recogniser hears after the sheet has gone is acted on. The
  // microphone itself is stopped in close(), not here: development mode's
  // double mount would stop the one the tap started.
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (TTS) speechSynthesis.cancel() } }, [])

  function stopVoice() {
    setHandsFree(false); setListening(false)
    const rec = recRef.current
    if (rec) { rec.onresult = rec.onerror = rec.onend = null; try { rec.abort() } catch { /* already stopped */ } }
    recRef.current = null
    if (TTS) speechSynthesis.cancel()
  }
  function close() { stopVoice(); onClose() }

  function speak(line, then) {
    // Read through a ref: this runs from recognition callbacks set up turns ago.
    if (!TTS || muteRef.current) { then?.(); return }
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(line)
    u.lang = 'en-US'
    u.onend = () => then?.()
    u.onerror = () => then?.()
    speechSynthesis.speak(u)
  }

  // `started` is a recogniser a tap already started ({ rec, events }); without
  // one, a new one starts here. `tap` says whether this call is inside a tap.
  // A hands-free turn starts after Sparky speaks, outside any tap, and an
  // iPhone may refuse it or hear nothing: then it asks for a tap rather than
  // reporting a permissions problem.
  function listen(started, tap = false) {
    if (!SR) return
    const fromTap = Boolean(started) || tap
    const rec = started?.rec || newRecognizer()
    let heard = ''
    let failed = ''
    setHint('')
    const onresult = (e) => {
      heard = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim()
      setText(heard)
    }
    const onerror = (e) => { failed = e.error || 'error' }
    const onend = () => {
      if (!alive.current) return
      setListening(false)
      if (heard) { send(heard, true); return }
      setHandsFree(false)
      if (failed === 'aborted') return
      const quiet = !failed || ['no-speech', 'not-allowed', 'service-not-allowed'].includes(failed)
      if (!fromTap && quiet) { setHint('Tap the mic to talk.'); return }
      setErr(micProblem(failed || 'no-speech'))
    }
    rec.onresult = onresult
    rec.onerror = onerror
    rec.onend = onend
    recRef.current = rec
    setListening(true)
    if (started) {
      // Replay whatever arrived before this sheet was ready.
      for (const [kind, e] of started.events) {
        if (kind === 'result') onresult(e)
        else if (kind === 'error') onerror(e)
        else { onend(); return }
      }
      return
    }
    try { rec.start() } catch {
      setListening(false); setHandsFree(false)
      if (fromTap) setErr(micProblem('error')); else setHint('Tap the mic to talk.')
    }
  }

  // Only ever called from a tap (the mic in this sheet).
  function startVoice() {
    setErr(''); setHint('')
    if (!SR) { setErr(micProblem('unsupported')); inputRef.current?.focus(); return }
    // iPhone only lets a page speak if speech first starts inside a tap.
    if (TTS && !mute) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance('')) }
    setHandsFree(true)
    listen(null, true)
  }

  function toggleMic() {
    if (listening || handsFree) { stopVoice(); return }
    startVoice()
  }

  // Photos, with whatever is typed in the box as their caption.
  async function sendPhotos(files) {
    if (!files?.length || busy) return
    setErr('')
    if (files.length > MAX_PHOTOS) { setErr(`Up to ${MAX_PHOTOS} pictures at a time. Send the rest in a second message.`); return }
    let images
    try { images = await Promise.all(files.map((f) => shrinkToJpeg(f))) } catch {
      setErr(files.length > 1 ? 'Couldn’t open one of those pictures. Try again without it.' : 'Couldn’t open that picture. Try another, or take a new one.')
      return
    }
    send(undefined, false, images)
  }

  async function send(said, spoken = false, images = null) {
    const line = (said ?? text).trim()
    if ((!line && !images?.length) || busy) return
    setText(''); setErr('')
    // Self-harm words, typed or spoken, open the 988 card on the phone at once,
    // before (and whether or not) the message reaches Sparky.
    checkCrisis(line)
    const next = [...msgsRef.current, { role: 'user', text: line, images }]
    setMsgs(next)
    setBusy(true)
    try {
      // The function only shows the model the newest MAX_PHOTOS photos (whole
      // messages, newest first); sending older ones would just slow the upload.
      const recent = new Set()
      let room = MAX_PHOTOS
      for (let i = next.length - 1; i >= 0 && room > 0; i--) {
        const n = next[i].images?.length || 0
        if (n && n <= room) { recent.add(i); room -= n } else if (n) break
      }
      const { data, error } = await supabase.functions.invoke('sparky-chat', {
        body: {
          // image_b64 too: a sparky-chat deployed before images_b64 reads the first.
          messages: next.map(({ role, text: t, images: imgs }, i) => (
            imgs?.length && recent.has(i) ? { role, text: t, images_b64: imgs, image_b64: imgs[0] }
              : { role, text: imgs?.length && !t ? '[photo shared earlier]' : t }
          )),
          now: localClock(),
        },
      })
      if (error || !data?.reply) {
        let msg = ''
        try { msg = (await error?.context?.json?.())?.error } catch { /* not JSON */ }
        throw new Error(msg || data?.error || 'Sparky couldn’t answer just now. Try again.')
      }
      setMsgs((m) => [...m, { role: 'assistant', text: data.reply, drafts: flatten(data.drafts, Boolean(images?.length)) }])
      // Sparky's own judgment, for words the phone's list missed.
      if (data.crisis) openCrisis()
      if (spoken && handsRef.current) speak(data.reply, () => { if (handsRef.current) listen() })
      else if (spoken) speak(data.reply)
    } catch (e) {
      setErr(e.message)
      setHandsFree(false)
    } finally {
      setBusy(false)
    }
  }

  async function save(mi, di) {
    const item = msgs[mi].drafts[di]
    const mark = (patch) => setMsgs((m) => m.map((x, i) => i !== mi ? x : { ...x, drafts: x.drafts.map((d, j) => j !== di ? d : { ...d, ...patch }) }))
    mark({ saving: true, error: '' })
    try {
      const r = item.row
      if (item.kind === 'medications') {
        await addMed(profile.id, r)
      } else if (item.kind === 'doses') {
        const m = matchMed(meds, r.name)
        await logDose(profile.id, { medication_id: m?.id, name: m?.name || r.name, dose: r.dose || m?.dose, notes: r.notes, taken_at: when(r.at) })
      } else {
        const row = { ...r }
        delete row.at
        if (item.kind === 'meals') {
          const lower = row.description.toLowerCase()
          Object.assign(row, {
            eaten_at: when(r.at), source: item.photo ? 'photo' : 'voice', confidence: row.confidence || 'low',
            trigger_watch: (profile.watch_list || []).filter((w) => lower.includes(String(w).toLowerCase())),
          })
        }
        if (item.kind === 'vitals') {
          row.taken_at = when(r.at)
          row.glucose_context = row.glucose_mgdl != null ? (row.glucose_context || 'random') : null
          // Pregnancy blood pressure check, on the phone, before saving.
          checkReading(row)
        }
        if (item.kind === 'exercise') row.done_at = when(r.at)
        if (item.kind === 'symptoms') {
          row.felt_at = when(r.at)
          row.severity_1_5 = Math.min(5, Math.max(1, Math.round(Number(row.severity_1_5) || 0)))
          checkSymptom(row)
        }
        const { error } = await supabase.from(TABLE[item.kind]).insert({ ...row, profile_id: profile.id })
        if (error) throw error
      }
      mark({ saving: false, saved: true })
      onLogged?.()
    } catch (e) {
      mark({ saving: false, error: e.message || 'Couldn’t save.' })
    }
  }

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet chat" role="dialog" aria-label="Talk to Sparky">
        <div className="chat-head">
          <img src="/sparky.png" alt="" width="36" height="36" />
          <h3>Sparky</h3>
          {TTS && (
            <button type="button" className="chat-ic" aria-pressed={!mute} aria-label={mute ? 'Sparky’s voice is off' : 'Sparky’s voice is on'}
              title={mute ? 'Voice off' : 'Voice on'} onClick={() => { setMute(!mute); if (!mute) speechSynthesis.cancel() }}>
              <Icon name="speaker" />{mute && <i className="slash" />}
            </button>
          )}
          <button type="button" className="chat-close" onClick={close}>Done</button>
        </div>

        <div className="chat-log" aria-live="polite">
          {msgs.length === 0 && (
            <div className="chat-hello">
              <p>Hi {profile.display_name}. Ask me about your log, tell me what happened —
                “I took two Advil at noon” or “headache, about a 4, started an hour ago” — or show me a picture:
                your plate, a medicine label, a blood-pressure screen.</p>
              <p className="note">Tap the mic to talk, type below, or tap the camera for a picture. I draft entries; nothing is saved until you tap Save. I’m not a doctor.</p>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.role}${m.images?.length ? ' has-photo' : ''}`}>
              {m.images?.length > 0 && (
                <div className={m.images.length > 1 ? 'bubble-photos' : undefined}>
                  {m.images.map((img, k) => (
                    <img key={k} className="bubble-photo" src={`data:image/jpeg;base64,${img}`} alt={m.images.length > 1 ? `Your photo ${k + 1}` : 'Your photo'} />
                  ))}
                </div>
              )}
              {m.text && <p>{m.text}</p>}
              {m.drafts?.length > 0 && (
                <ul className="drafts">
                  {m.drafts.map((d, j) => (
                    <li key={j}>
                      <div className="draft-body">
                        <span className="draft-kind">{LABEL[d.kind]}</span>
                        <b>{d.title}</b>{d.stats && <span> · {d.stats}</span>}
                        {d.error && <div className="err">{d.error}</div>}
                      </div>
                      {d.saved
                        ? <span className="draft-saved">✓ Saved</span>
                        : <button type="button" className="chip took" disabled={d.saving} onClick={() => save(i, j)}>{d.saving ? 'Saving…' : 'Save'}</button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {busy && <div className="bubble assistant thinking"><p>{msgs[msgs.length - 1]?.images?.length > 1 ? 'Sparky is looking at your pictures…' : msgs[msgs.length - 1]?.images?.length ? 'Sparky is looking at your picture…' : 'Sparky is thinking…'}</p></div>}
          <div ref={endRef} />
        </div>

        {err && <p className="err">{err}</p>}
        {!err && hint && <p className="note chat-hint">{hint}</p>}

        <form className="chat-bar" onSubmit={(e) => { e.preventDefault(); send() }}>
          <input ref={camRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; sendPhotos(f) }} />
          <button type="button" className="cam" aria-label="Send a picture" title="Send a picture"
            disabled={busy} onClick={() => camRef.current?.click()}>
            <Icon name="camera" />
          </button>
          <button type="button" className={`mic${listening ? ' on' : ''}${handsFree && !listening ? ' wait' : ''}`}
            aria-pressed={listening || handsFree} aria-label={listening || handsFree ? 'Stop talking' : 'Talk to Sparky'} onClick={toggleMic}>
            <Icon name="mic" />
          </button>
          <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? 'Listening…' : 'Ask Sparky or tell him what happened'}
            aria-label="Message to Sparky" enterKeyHint="send" />
          <button type="submit" className="send" aria-label="Send" disabled={busy || !text.trim()}><Icon name="send" /></button>
        </form>
      </div>
    </div>
  )
}
