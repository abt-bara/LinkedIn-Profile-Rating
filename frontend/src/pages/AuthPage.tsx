import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import heroImage from "../assets/hero.png";

const LOGIN_ERRORS: Record<string, string> = {
  access_denied: "LinkedIn sign-in was cancelled. You can try again.",
  login_failed: "We couldn't complete LinkedIn sign-in. Please try again.",
  session_expired: "Your sign-in session expired. Please start again.",
};

function getSessionError(state: unknown): string | null {
  if (
    typeof state !== "object" ||
    state === null ||
    !("sessionError" in state)
  ) {
    return null;
  }

  return typeof state.sessionError === "string" ? state.sessionError : null;
}

export function AuthPage() {
  const location = useLocation();
  const { user, loading, loadError, retrySession } = useAuth();
  const stateError = getSessionError(location.state);
  const loginError = new URLSearchParams(location.search).get("error");
  const sessionError =
    stateError ??
    loadError ??
    (loginError ? LOGIN_ERRORS[loginError] ?? LOGIN_ERRORS.login_failed : null);

  if (loading) {
    return (
      <main className="session-loading" role="status">
        <span className="loading-mark" aria-hidden="true">in</span>
        <p>Checking your session…</p>
      </main>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  function handleLinkedIn() {
    window.location.assign("/api/signIn");
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="auth-content">
          <span className="eyebrow">WELCOME TO PROFILE RATER</span>
          <h1 className="large-heading headline-fade">
            Your next chapter starts here.
          </h1>
          <p className="auth-description">
            Sign in or create your account securely with LinkedIn. If this is
            your first time here, we’ll create your account for you.
          </p>

          <button
            className="button button-primary auth-oauth-button"
            type="button"
            onClick={handleLinkedIn}
          >
            <span className="linkedin-button-mark" aria-hidden="true">
              in
            </span>
            Continue with LinkedIn
            <span aria-hidden="true">→</span>
          </button>

          {sessionError && (
            <p className="notice notice-error auth-notice" role="alert">
              {sessionError}
            </p>
          )}

          {loadError && (
            <button
              className="auth-retry-button"
              type="button"
              onClick={() => void retrySession()}
            >
              Try checking your session again
            </button>
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
          <h2 className="large-heading headline-fade">
            Every next step
            <br />
            starts with a<br />
            <em>stronger story.</em>
          </h2>
          <p>
            Get a fresh perspective on your professional presence — and move
            forward with confidence.
          </p>
          <div className="visual-indicator">
            <i />
            <i />
            <i />
          </div>
        </div>
        <span className="visual-caption">
          Thoughtful feedback for your professional story.
        </span>
      </aside>
    </main>
  );
}
