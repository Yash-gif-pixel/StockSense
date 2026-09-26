import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { isAuthPath, setUnauthorizedHandler } from '@/api/client'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'
import './index.css'

async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return
  const { worker } = await import('./mocks/browser')
  // Only /api/* is mocked; assets and Vite HMR pass through.
  await worker.start({ onUnhandledRequest: 'bypass' })
}

// On 401 outside the auth pages: drop all cached server state and go to /login.
setUnauthorizedHandler(() => {
  if (isAuthPath(window.location.pathname)) return
  const { pathname, search } = window.location
  queryClient.clear()
  // Keep where the user was so LoginPage can send them back after signing in.
  void router.navigate('/login', { replace: true, state: { from: pathname + search } })
})

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors closeButton />
      </QueryClientProvider>
    </StrictMode>,
  )
}

enableMocking().then(render, (err: unknown) => {
  // Never leave a blank page: render anyway and surface why mocks are unavailable.
  console.error('[mocks] failed to start', err)
  render()
  setTimeout(() => toast.error('Mock API failed to start (service workers unavailable). See console.'), 0)
})
