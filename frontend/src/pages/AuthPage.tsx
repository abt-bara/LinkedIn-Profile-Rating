import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import heroImage from "/hero.jpg";
import { authService } from "../services/authService";

const LOGIN_ERRORS: Record<string, string> = {
  access_denied: "LinkedIn sign-up was cancelled. You can try again.",
  login_failed: "We couldn't complete LinkedIn sign-up. Please try again.",
  session_expired: "Your sign-in session expired. Please start again.",
  account_exists: "This LinkedIn account is already registered. Sign in instead.",
  verified_email_required:
    "Sign-up requires a verified email address on your LinkedIn account.",
  signup_failed: "We couldn't complete sign-up. Please try again.",
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
  const [mode, setMode] = useState<"signin" | "signup" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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

  function showForm(nextMode: "signin" | "signup") {
    setMode((current) => (current === nextMode ? null : nextMode));
    setPassword("");
    setActionError(null);
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setActionError(null);
    try {
      await authService.signIn(email, password);
      window.location.assign("/");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not sign in. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setActionError(null);
    try {
      const authorizationUrl = await authService.beginSignup(password);
      window.location.assign(authorizationUrl);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not start sign-up. Try again.",
      );
      setSubmitting(false);
    }
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
            Sign in with your email and password. New here? Create your account
            once with LinkedIn.
          </p>

          <div className="auth-flow-actions">
            <button
              className="button button-primary auth-oauth-button"
              type="button"
              aria-expanded={mode === "signin"}
              aria-controls="auth-inline-form"
              onClick={() => showForm("signin")}
              disabled={submitting}
            >
              Sign in
            </button>

            <div
              id="auth-inline-form"
              className={`auth-form-disclosure${mode ? " is-open" : ""}`}
              aria-hidden={!mode}
            >
              <div className="auth-form-disclosure-inner">
                {mode === "signin" ? (
                  <form className="auth-credential-form" onSubmit={(event) => void handleSignIn(event)}>
                    <label htmlFor="signin-email">Email</label>
                    <input
                      id="signin-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      disabled={submitting}
                    />
                    <label htmlFor="signin-password">Password</label>
                    <input
                      id="signin-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      disabled={submitting}
                    />
                    <button
                      className="button button-primary auth-submit-button"
                      type="submit"
                      disabled={submitting}
                    >
                      {submitting ? "Signing in…" : "Continue"}
                    </button>
                  </form>
                ) : mode === "signup" ? (
                  <form className="auth-credential-form" onSubmit={(event) => void handleSignUp(event)}>
                    <p className="auth-form-hint">
                      Choose a password first, then verify your account with LinkedIn.
                    </p>
                    <label htmlFor="signup-password">Create a password</label>
                    <input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      disabled={submitting}
                    />
                    <button
                      className="button button-primary auth-submit-button"
                      type="submit"
                      disabled={submitting}
                    >
                      {submitting ? "Starting sign-up…" : "Continue with LinkedIn"}
                      <span aria-hidden="true">→</span>
                    </button>
                  </form>
                ) : null}
                {(actionError || sessionError) && (
                  <p className="notice notice-error auth-notice" role="alert">
                    {actionError ?? sessionError}
                  </p>
                )}
              </div>
            </div>

            <button
              className="button auth-signup-button"
              type="button"
              aria-expanded={mode === "signup"}
              aria-controls="auth-inline-form"
              onClick={() => showForm("signup")}
              disabled={submitting}
            >
              <span className="linkedin-button-mark" aria-hidden="true">
                in
              </span>
              Sign up with LinkedIn
            </button>
          </div>

          {!mode && sessionError && (
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
            LinkedIn is used once to verify your account. Your password is kept
            private and never sent to LinkedIn.
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
