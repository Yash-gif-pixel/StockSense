import { http, passthrough, type RequestHandler } from 'msw'
import { authHandlers } from './handlers/auth'
import { dashboardHandlers } from './handlers/dashboard'
import { moveHandlers } from './handlers/moves'
import { operationHandlers } from './handlers/operations'
import { productHandlers } from './handlers/products'
import { settingsHandlers } from './handlers/settings'
import { LIVE } from './live'
import { apiError } from './utils'

// One handler group per contract section. Live sections pass straight through to the real backend.
// The catch-all MUST stay last: any other /api call without a mock fails loudly in the contract error shape
// instead of silently falling through to the backend, which may not implement it yet.
export const handlers: RequestHandler[] = [
  ...(LIVE.auth ? [http.all('/api/auth/*', () => passthrough())] : authHandlers),
  ...settingsHandlers,
  ...productHandlers,
  ...(LIVE.operations ? [http.all('/api/operations', () => passthrough()), http.all('/api/operations/*', () => passthrough())] : operationHandlers),
  ...moveHandlers,
  ...dashboardHandlers,
  http.all('/api/*', ({ request }) => {
    const url = new URL(request.url)
    return apiError(404, 'not_found', `No mock for ${request.method} ${url.pathname}`)
  }),
]
