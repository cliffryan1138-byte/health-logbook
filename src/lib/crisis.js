// The 988 crisis card's triggers (approved safety flow, 2026-10-08; widened
// by Cliff the same day from Sparky's chat to every text box).
//
// Anything that opens the card calls openCrisis(). The card (CrisisCard,
// mounted once in App) listens for it. It works with no network, and nothing
// about it is recorded: no entry, no log line, no notification.

const listeners = new Set()
export const onCrisis = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
export const openCrisis = () => listeners.forEach((fn) => fn())

// Words that point to suicide or self-harm. Broad on purpose: a card shown
// when it wasn't needed costs a tap; a card missed costs far more.
const PHRASES = new RegExp([
  'suicid\\w*', 'kill(ing)? (my ?self|me)', 'end(ing)? (my life|it all)', 'take my (own )?life',
  '(want|wanted|wanna|going) to die', 'wish i (was|were) dead', 'better off dead',
  '(hurt|hurting|harm|harming|cut|cutting) myself', 'self[- ]?harm\\w*',
  'no reason to live', "(don'?t|do not) want to (live|be alive|be here|wake up)", 'overdos\\w*',
].map((p) => `\\b${p}\\b`).join('|'), 'i')

export const mentionsCrisis = (text) => typeof text === 'string' && PHRASES.test(text.replace(/[’‘]/g, "'"))

// Check text and open the card if it matches. Returns whether it did.
export function checkCrisis(text) {
  if (!mentionsCrisis(text)) return false
  openCrisis()
  return true
}
