import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function ProtectedRoute() {
  // return <Outlet />  // DEV BYPASS: uncomment to preview pages without auth
  // AuthProvider verifies the session through GET /api/user using the HttpOnly cookie.
  const { user, loading, loadError } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="session-loading" role="status">
        <span className="loading-mark" aria-hidden="true">in</span>
        <p>Checking your session…</p>
      </main>
    )
  }

  if (!user) {
    return (
      <Navigate
        to="/auth"
        replace
        state={{ from: location, sessionError: loadError }}
      />
    )
  }

  return <Outlet /> 
}
