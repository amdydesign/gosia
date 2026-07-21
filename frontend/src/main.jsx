import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: register the service worker (production build only)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Nowy service worker znaleziony → po zainstalowaniu zaproponuj odświeżenie
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdatePrompt()
          }
        })
      })
    }).catch(() => {
      // offline shell/push are progressive enhancements - app works without them
    })

    // Przeładuj stronę, gdy nowy worker przejmie kontrolę
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })
  })
}

function showUpdatePrompt() {
  if (document.getElementById('sw-update-banner')) return

  const banner = document.createElement('div')
  banner.id = 'sw-update-banner'
  banner.setAttribute('role', 'status')
  banner.style.cssText =
    'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;' +
    'background:#111827;color:#fff;padding:12px 16px;border-radius:12px;display:flex;' +
    'gap:12px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:14px;max-width:90vw'

  const text = document.createElement('span')
  text.textContent = 'Dostępna nowa wersja aplikacji.'

  const button = document.createElement('button')
  button.textContent = 'Odśwież'
  button.style.cssText =
    'background:#c084a0;color:#fff;border:0;border-radius:8px;padding:6px 14px;font-weight:600;cursor:pointer'
  button.onclick = () => {
    navigator.serviceWorker.getRegistration().then((registration) => {
      registration?.waiting?.postMessage('SKIP_WAITING')
      // Fallback, gdyby worker nie obsłużył wiadomości
      setTimeout(() => window.location.reload(), 800)
    })
  }

  banner.append(text, button)
  document.body.appendChild(banner)
}
