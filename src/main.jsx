import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// "healthtrack.wastegate.ai." (trailing dot — a valid but unusual spelling
// that a bookmark had picked up) is a separate origin to the browser: its
// sign-in is stored separately, and email links sent back to it failed to
// load for at least one tester. Move to the plain host, keeping the path and
// the #hash so any sign-in tokens in it survive the hop.
if (location.hostname.endsWith('.')) {
  const u = new URL(location.href)
  u.hostname = u.hostname.replace(/\.+$/, '')
  location.replace(u.toString())
}

// Keep a copy of the app on the phone so it opens with no connection
// (public/sw.js). Production only: the dev server's files change constantly.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* private mode, old browser: works online as before */ })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
