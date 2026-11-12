import { createContext, useContext } from 'react'
import type { AuthUser } from '../services/authService'

export interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  loadError: string | null
  signOut: () => Promise<void>
  retrySession: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.')
  return context
}
