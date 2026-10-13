import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { getAttribution } from './lib/attribution'

import './styles/tokens.css'
import './styles/base.css'
import './styles/sections.css'
import './styles/form.css'

// Capture how this visit arrived before anything can change the URL. Reading it
// again when the form submits returns the same stored value.
getAttribution()

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
