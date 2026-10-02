import { StrictMode, useEffect, useState } from 'react'
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

function PwaUpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | null = null
    const onControllerChange = () => window.location.reload()

    navigator.serviceWorker.ready.then(current => {
      registration = current
      if (current.waiting && navigator.serviceWorker.controller) setWaiting(current.waiting)
      current.addEventListener('updatefound', () => {
        const worker = current.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker)
        })
      })
    })

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => {
      registration = null
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  if (!waiting) return null

  return <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-emerald-400/20 bg-[#131b2a] p-3 shadow-2xl">
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold">Nova versão disponível</p>
      <p className="mt-0.5 text-xs text-white/45">Atualize para continuar com a versão mais recente.</p>
    </div>
    <button onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })} className="game-button game-button-primary shrink-0">Atualizar</button>
  </div>
}

async function bootstrap() {
  await supabase.auth.getSession()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      <PwaUpdatePrompt />
    </StrictMode>,
  )
}

registerServiceWorker()
void bootstrap()
