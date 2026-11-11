import { useEffect } from 'react'
import { useAuth } from './auth/AuthContext'
import { AuthProvider } from './auth/AuthProvider'
import { AuthPage } from './pages/AuthPage'
import { ProfileCheckPage } from './pages/ProfileCheckPage'
import './App.css'

function AppRoutes() {
  const { user, loading } = useAuth()
  const path = window.location.pathname

  useEffect(() => {
    if (!loading && path === '/auth' && user) {
      window.location.replace('/')
    }

    if (!loading && path === '/' && !user) {
      window.location.replace('/auth')
    }
  }, [loading, path, user])

  if (loading) {
    return (
      <main className="session-loading" role="status">
        <span className="loading-mark">in</span>
        <p>Checking your session…</p>
      </main>
    )
  }

  if (path === '/auth') return user ? null : <AuthPage />
  if (path !== '/') {
    return (
      <main className="session-loading">
        <p>Page not found.</p>
        <a href="/">Return to profile review</a>
      </main>
    )
  }

  return user ? <ProfileCheckPage /> : null
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
