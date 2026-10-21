// Speech in and out for talking to Sparky, using the browser's own
// recognition and voice (Safari and Chrome).
//
// iPhones only let a page use the microphone, or speak, when it starts inside
// the tap itself. The dock's mic used to open the chat and start listening
// once the chat had drawn, a moment after the tap, and on an iPhone that first
// listen could fail without a word. So the tap calls beginListening(), which
// starts the recogniser and wakes the voice there and then; the chat adopts it
// with takeListening() when it opens. Events that arrive before the chat is
// ready are kept and replayed.

export const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
export const TTS = typeof window !== 'undefined' && 'speechSynthesis' in window

let pending = null

export function newRecognizer() {
  const rec = new SR()
  rec.lang = 'en-US'
  rec.interimResults = true
  rec.continuous = false
  return rec
}

// Call inside a tap. Safe to call when speech isn't available.
export function beginListening({ muted = false } = {}) {
  if (TTS && !muted) { try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance('')) } catch { /* no voice */ } }
  if (!SR) return
  const rec = newRecognizer()
  const events = []
  rec.onresult = (e) => events.push(['result', e])
  rec.onerror = (e) => events.push(['error', e])
  rec.onend = () => events.push(['end'])
  try { rec.start() } catch { return }
  pending = { rec, events, at: Date.now() }
}

// The recogniser a tap just started, if any (and only a fresh one).
export function takeListening() {
  const p = pending
  pending = null
  return p && Date.now() - p.at < 5000 ? p : null
}

// Plain words for each way listening can fail. On an iPhone the page's speech
// recognition runs on Apple's dictation, so Dictation being off blocks it too.
const IOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)
export function micProblem(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return IOS
      ? 'Daybook can’t use the microphone. Tap Allow when asked, and check Dictation is on (Settings › General › Keyboard › Enable Dictation). Or type — the keyboard’s mic key works too.'
      : 'Microphone access is off for this site. Allow it in your browser’s settings, or type instead.'
  }
  if (code === 'audio-capture') return 'No microphone was found. Type instead.'
  if (code === 'network') return 'Talking needs a connection. Type instead, or try again when you’re back online.'
  if (code === 'no-speech') return 'I didn’t hear anything. Tap the mic and talk, or type.'
  if (code === 'unsupported') return 'Talking isn’t available in this browser. Type instead — or use the keyboard’s mic key to dictate.'
  return 'Listening stopped. Tap the mic to try again, or type.'
}
