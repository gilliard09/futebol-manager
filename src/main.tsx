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
  const { data: sessionData } = await supabase.auth.getSession()

  if (!sessionData.session) {
    await Promise.race([
      supabase.auth.signInAnonymously(),
      new Promise(resolve => setTimeout(resolve, 4000)),
    ]).catch(() => undefined)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

registerServiceWorker()
void bootstrap()
