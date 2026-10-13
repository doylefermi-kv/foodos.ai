import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { getAttribution } from './lib/attribution'
import { applyAbsoluteMetaUrls } from './lib/meta'

import './styles/tokens.css'
import './styles/base.css'
import './styles/sections.css'
import './styles/form.css'

// Capture how this visit arrived before anything can change the URL. Reading it
// again when the form submits returns the same stored value.
getAttribution()

// index.html carries %BASE_URL%-relative canonical/OG URLs so they survive the
// GitHub Pages sub-path; Open Graph wants them absolute.
applyAbsoluteMetaUrls()

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
