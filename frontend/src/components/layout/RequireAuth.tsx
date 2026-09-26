import { Navigate, Outlet, useLocation } from 'react-router'
import { isApiError } from '@/api/client'
import { FullPageError, FullPageLoader } from '@/components/FullPageStatus'
import { useMe } from '@/hooks/useAuth'

/** Gate for every logged-in route: GET /api/auth/me must succeed. */
export function RequireAuth() {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) return <FullPageLoader />

  if (me.isError) {
    if (isApiError(me.error) && me.error.status === 401) {
      return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
    }
    return <FullPageError message={me.error.message} onRetry={() => void me.refetch()} />
  }

  return <Outlet />
}
