import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import heroImage from '../assets/hero.png'

const features = [
  {
    eyebrow: 'A clearer overview',
    title: 'See your profile at a glance.',
    description:
      'Bring profile ratings and key signals together in one dashboard, so it is easier to understand what is working and where to focus next.',
    points: ['A focused view of your profile', 'Ratings that are easy to scan'],
    variant: 'dashboard',
  },
  {
    eyebrow: 'AI-powered feedback',
    title: 'Turn feedback into your next step.',
    description:
      'Get an AI-assisted profile rating with useful observations and recommendations to help strengthen your professional story.',
    points: ['A rating with context', 'Practical ideas for improvement'],
    variant: 'rating',
  },
  {
    eyebrow: 'Stay organized',
    title: 'Keep profile reviews in reach.',
    description:
      'Use lists to keep the profiles you are reviewing organized, making it easier to return to the right people and follow up.',
    points: ['Organized profile lists', 'A simpler way to revisit reviews'],
    variant: 'lists',
  },
] as const

type FeatureVariant = (typeof features)[number]['variant']

function FeatureArtwork({ variant }: { variant: FeatureVariant }) {
  if (variant === 'dashboard') {
    return (
      <div className="home-preview home-preview-dashboard" aria-hidden="true">
        <div className="home-preview-heading">
          <div>
            <span className="home-preview-label">PROFILE OVERVIEW</span>
            <strong>Your profile snapshot</strong>
          </div>
          <span className="home-preview-status">Ready to review</span>
        </div>
        <div className="home-score-card">
          <div>
            <span className="home-preview-label">OVERALL RATING</span>
            <strong className="home-score">82<span>/100</span></strong>
          </div>
          <span className="home-score-icon">↗</span>
          <div className="home-score-track"><span /></div>
        </div>
        <div className="home-metric-list">
          <div><span>Headline</span><strong>Strong</strong><i className="home-metric-fill home-metric-fill-strong" /></div>
          <div><span>Experience</span><strong>Good</strong><i className="home-metric-fill home-metric-fill-good" /></div>
          <div><span>Skills</span><strong>Growing</strong><i className="home-metric-fill home-metric-fill-growing" /></div>
        </div>
      </div>
    )
  }

  if (variant === 'rating') {
    return (
      <div className="home-preview home-preview-rating" aria-hidden="true">
        <div className="home-preview-heading">
          <div>
            <span className="home-preview-label">AI PROFILE REVIEW</span>
            <strong>Your next steps</strong>
          </div>
          <span className="home-ai-mark">✦</span>
        </div>
        <div className="home-rating-body">
          <div className="home-rating-ring"><span>82<small>/100</small></span></div>
          <div className="home-rating-summary">
            <span className="home-preview-label">PROFILE RATING</span>
            <strong>A strong foundation</strong>
            <p>Clear recommendations help you focus your next update.</p>
          </div>
        </div>
        <div className="home-recommendation">
          <span className="home-recommendation-icon">✦</span>
          <span><strong>Make your impact stand out</strong><small>Highlight measurable outcomes in your experience.</small></span>
          <span className="home-recommendation-arrow">↗</span>
        </div>
      </div>
    )
  }

  return (
    <div className="home-preview home-preview-lists" aria-hidden="true">
      <div className="home-preview-heading">
        <div>
          <span className="home-preview-label">YOUR WORKSPACE</span>
          <strong>Profile lists</strong>
        </div>
        <span className="home-list-add">+</span>
      </div>
      <div className="home-list-tabs"><span className="is-active">All profiles <b>12</b></span><span>To review <b>4</b></span></div>
      <div className="home-profile-list">
        <div className="home-profile-row"><span className="home-avatar home-avatar-blue">JD</span><span><strong>Jordan Davis</strong><small>Product designer</small></span><i className="home-profile-dot" /></div>
        <div className="home-profile-row"><span className="home-avatar home-avatar-gold">AM</span><span><strong>Alex Morgan</strong><small>Marketing lead</small></span><i className="home-profile-dot home-profile-dot-muted" /></div>
        <div className="home-profile-row"><span className="home-avatar home-avatar-green">RC</span><span><strong>Riley Chen</strong><small>Software engineer</small></span><i className="home-profile-dot" /></div>
      </div>
      <div className="home-list-footer"><span>Keep your reviews moving</span><span>→</span></div>
    </div>
  )
}

export function HomePage() {
  const { user } = useAuth()
  const primaryHref = user ? '/' : '/auth'
  const primaryLabel = user ? 'Open your dashboard' : 'Get started with LinkedIn'

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-header-inner">
          <Link className="home-brand rater-brand" to="/home" aria-label="Profile Rater home">
            <span className="rater-brand-mark">in</span>
            <span>profile<span className="rater-brand-accent">rater</span></span>
          </Link>
          <nav className="home-nav" aria-label="Main navigation">
            <a href="#features">Features</a>
            {!user && <Link to="/auth">Sign in</Link>}
            <Link className="home-nav-cta" to={primaryHref}>{user ? 'Open dashboard' : 'Get started'}</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="home-hero">
          <div className="home-hero-copy">
            <span className="home-eyebrow"><i /> YOUR PROFESSIONAL STORY, IN FOCUS</span>
            <h1>Make your LinkedIn profile work <em>harder for you.</em></h1>
            <p>
              Get a clearer view of your profile, thoughtful AI-powered feedback,
              and a simple place to keep your reviews moving.
            </p>
            <div className="home-hero-actions">
              <Link className="home-button home-button-primary" to={primaryHref}>
                {primaryLabel}<span aria-hidden="true">→</span>
              </Link>
              <a className="home-text-link" href="#features">Explore the features <span aria-hidden="true">↓</span></a>
            </div>
            <div className="home-proof"><span className="home-proof-mark">in</span><span>Designed to help you tell a stronger professional story.</span></div>
          </div>
          <div className="home-hero-visual">
            <div className="home-hero-image-wrap">
              <img src={heroImage} alt="" />
              <div className="home-hero-image-shade" />
              <div className="home-hero-image-caption"><span>YOUR STORY, WITH CLARITY</span><strong>Take the next step<br />with confidence.</strong></div>
            </div>
            <div className="home-floating-rating">
              <span className="home-floating-icon">✦</span>
              <span><small>PROFILE RATING</small><strong>82 <i>/ 100</i></strong></span>
              <span className="home-floating-trend">↗</span>
            </div>
            <div className="home-floating-note"><span>✓</span> A clearer path forward</div>
          </div>
        </section>

        <section className="home-features" id="features" aria-labelledby="home-features-title">
          <div className="home-section-intro">
            <span className="home-eyebrow">A BETTER WAY TO REVIEW</span>
            <h2 id="home-features-title">Everything you need to move your profile forward.</h2>
            <p>From the first rating to the next improvement, keep your focus in one place.</p>
          </div>
          <div className="home-feature-list">
            {features.map((feature, index) => (
              <article
                className={`home-feature${index % 2 === 1 ? ' home-feature-reverse' : ''}`}
                key={feature.variant}
              >
                <div className="home-feature-copy">
                  <span className="home-feature-number">0{index + 1}</span>
                  <span className="home-eyebrow">{feature.eyebrow}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <ul>
                    {feature.points.map((point) => <li key={point}><span>✓</span>{point}</li>)}
                  </ul>
                </div>
                <div className={`home-feature-visual home-feature-visual-${feature.variant}`}>
                  <FeatureArtwork variant={feature.variant} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="home-bottom-cta">
          <div>
            <span className="home-eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
            <h2>Ready to see your profile in a new light?</h2>
          </div>
          <Link className="home-button home-button-light" to={primaryHref}>
            {primaryLabel}<span aria-hidden="true">→</span>
          </Link>
        </section>
      </main>

      <footer className="home-footer">
        <Link className="home-brand rater-brand" to="/home" aria-label="Profile Rater home">
          <span className="rater-brand-mark">in</span>
          <span>profile<span className="rater-brand-accent">rater</span></span>
        </Link>
        <span>Thoughtful feedback for your professional story.</span>
        <Link to={primaryHref}>{user ? 'Dashboard' : 'Sign in'}</Link>
      </footer>
    </div>
  )
}
