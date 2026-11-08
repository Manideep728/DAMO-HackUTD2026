import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// A visit to the bare site URL (no #route) opens the landing page; in-app links to "/" carry "#/" and are unaffected.
if (!window.location.hash) window.history.replaceState(null, '', '#/about')

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
