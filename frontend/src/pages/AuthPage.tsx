import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import heroImage from '../assets/hero.png'
import { useAuth } from '../auth/AuthContext'
import { authService } from '../services/authService'

function getSessionError(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('sessionError' in state)) {
    return null
  }

  return typeof state.sessionError === 'string' ? state.sessionError : null
}

export function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { completeSignIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const sessionError = getSessionError(location.state)

  async function handleLinkedIn() {
    setError(null)
    setPending(true)

    try {
      const profile = await authService.authenticate('linkedin')
      if (profile) {
        completeSignIn(profile)
        navigate('/', { replace: true })
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not continue with LinkedIn.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <Link className="brand auth-brand" to="/">
          <span className="brand-mark" aria-hidden="true">in</span>
          <span>profile<span className="brand-accent">rater</span></span>
        </Link>

        <div className="auth-content">
          <Link className="back-link" to="/">← Back to profile review</Link>
          <span className="eyebrow">WELCOME TO PROFILE RATER</span>
          <h1 className="large-heading headline-fade">Your next chapter starts here.</h1>
          <p className="auth-description">
            Sign in or create your account securely with LinkedIn. If this is
            your first time here, we’ll create your account for you.
          </p>

          <button
            className="button button-primary auth-oauth-button"
            type="button"
            onClick={() => void handleLinkedIn()}
            disabled={pending}
          >
            <span className="linkedin-button-mark" aria-hidden="true">in</span>
            {pending ? 'Continuing…' : 'Continue with LinkedIn'}
            <span aria-hidden="true">→</span>
          </button>

          {(error || sessionError) && (
            <p className="notice notice-error auth-notice" role="alert">
              {error || sessionError}
            </p>
          )}

          <p className="auth-privacy">
            LinkedIn is the only way to sign in or create an account.
          </p>
        </div>
        <span className="auth-copyright">© 2026 Profile Rater</span>
      </section>

      <aside className="auth-visual">
        <img src={heroImage} alt="" />
        <div className="auth-visual-overlay" />
        <div className="auth-visual-copy">
          <span className="visual-sparkle">✳</span>
          <p className="eyebrow">YOUR STORY, WITH CLARITY</p>
          <h2 className="large-heading headline-fade">Every next step<br />starts with a<br /><em>stronger story.</em></h2>
          <p>Get a fresh perspective on your professional presence — and move forward with confidence.</p>
          <div className="visual-indicator"><i /><i /><i /></div>
        </div>
        <span className="visual-caption">Thoughtful feedback for your professional story.</span>
      </aside>
    </main>
  )
}
