import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { supabase } from './lib/supabase'
import App from './App'

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(registration => {
        void registration.update()
      })
      .catch(() => undefined)
  })
}

async function bootstrap() {
  await supabase.auth.getSession()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

registerServiceWorker()
void bootstrap()
