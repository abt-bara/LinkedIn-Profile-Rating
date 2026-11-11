import { useEffect, useState } from 'react'
import heroImage from '../assets/hero.png'
import { useAuth } from '../auth/AuthContext'
import { authService } from '../services/authService'

export function AuthPage() {
  const { user, loading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!loading && user) window.location.replace('/')
  }, [loading, user])

  async function handleLinkedIn() {
    setError(null)
    setPending(true)

    try {
      const profile = await authService.authenticate('linkedin')
      if (profile) {
        window.location.replace('/')
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
        <a className="brand auth-brand" href="/">
          <span className="brand-mark" aria-hidden="true">in</span>
          <span>profile<span className="brand-accent">rater</span></span>
        </a>

        <div className="auth-content">
          <a className="back-link" href="/">← Back to profile review</a>
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

          {error && (
            <p className="notice notice-error auth-notice" role="alert">
              {error}
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
