import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Self-hosted brand fonts (offline, no CDN) — Montserrat for headings, Source Sans 3 for body.
import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/600.css'
import '@fontsource/montserrat/700.css'
import '@fontsource-variable/source-sans-3'

import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
