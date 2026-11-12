import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authService, type AuthUser } from '../services/authService'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const retrySession = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setUser(await authService.getCurrentUser())
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Could not verify your session.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void retrySession()
    }, 0)

    return () => window.clearTimeout(id)
  }, [retrySession])

  const signOut = useCallback(async () => {
    await authService.signOut()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      loadError,
      signOut,
      retrySession,
    }),
    [user, loading, loadError, signOut, retrySession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
