import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Self-hosted brand fonts (offline, no CDN) — Montserrat for headings, Source Sans 3 for body.
import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/600.css'
import '@fontsource/montserrat/700.css'
import '@fontsource-variable/source-sans-3'

import './index.css'
import App from './App'
import { initSimSync } from './sync/simSync'

// Called once here, at true module-load time — never inside a React effect — so it's
// naturally immune to StrictMode's dev-mode double-invoke of render/effect functions,
// and its synchronous localStorage hydration lands before the first paint below (a
// BroadcastChannel handshake reply, if any, still arrives asynchronously — that part
// can't be avoided without blocking). No-op when this window wasn't opened with a
// `?session=` (i.e. every standalone/solo-practice load, unchanged).
const sessionId = new URLSearchParams(window.location.search).get('session')
if (sessionId) initSimSync(sessionId)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
