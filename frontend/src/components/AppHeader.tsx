import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function AppHeader() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  async function handleSignOut() {
    setSigningOut(true)
    setSignOutError(null)

    try {
      await signOut()
      navigate('/auth', { replace: true })
    } catch (error) {
      setSignOutError(
        error instanceof Error ? error.message : 'Could not sign out. Try again.',
      )
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <header className="rater-header" aria-label="Profile header">
      <div className="rater-brand" aria-label="Profile Rater home">
        <span className="rater-brand-mark">in</span>
        <span>profile<span className="rater-brand-accent">rater</span></span>
      </div>
      <div className="rater-header-actions">
        <span className="rater-header-user">{user?.name}</span>
        <button
          type="button"
          className="rater-signout-button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
        {signOutError && (
          <span className="rater-signout-error" role="alert">
            {signOutError}
          </span>
        )}
      </div>
    </header>
  )
}
