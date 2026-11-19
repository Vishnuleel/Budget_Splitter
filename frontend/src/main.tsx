import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { capturePwaInstallPrompt } from './lib/pwa'

capturePwaInstallPrompt()

// Offline support for the home-screen app. Only in production builds — in dev it would
// cache modules and fight Vite's hot reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker failed', err))
  })
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
