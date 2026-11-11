import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AppHeader } from '../components/AppHeader'
import {
  COLOR_MAP,
  analyze,
  getGraph,
  type GraphResponse,
} from '../services/httpClient'

const MAX_FILE_SIZE = 15 * 1024 * 1024

function clampValue(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function toBarHeight(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return clampValue(value)
}

function getMetricEntries(
  response: GraphResponse | null,
): Array<{ key: string; name: string; val?: number; oldval?: number }> {
  if (!response) return []

  return Object.entries(response)
    .filter(
      ([, metric]) => metric && (typeof metric.val === 'number' || typeof metric.oldval === 'number'),
    )
    .map(([key, metric]) => ({
      key,
      name: metric.name || key,
      val: metric.val,
      oldval: metric.oldval,
    }))
}

export function ProfileCheckPage() {
  const { user } = useAuth()
  const graphRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [graphLoading, setGraphLoading] = useState(true)
  const [graphVisible, setGraphVisible] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<unknown>(null)
  const [isResultOpen, setIsResultOpen] = useState(false)

  useEffect(() => {
    let active = true

    getGraph()
      .then((response) => {
        if (!active) return
        setGraph(response)
      })
      .catch(() => {
        if (!active) return
        setGraph({})
      })
      .finally(() => {
        if (active) setGraphLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const node = graphRef.current
    if (!node || graphLoading) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      const id = window.setTimeout(() => {
        setGraphVisible(true)
      }, 0)

      return () => window.clearTimeout(id)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setGraphVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [graphLoading])

  useEffect(() => {
    if (!videoOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVideoOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [videoOpen])

  const metrics = useMemo(() => getMetricEntries(graph), [graph])
  const firstName = user?.firstName || user?.name?.split(/\s+/)[0] || 'Friend'

  const totalScore = useMemo(() => {
    if (!metrics.length) return 0
    const total = metrics.reduce((sum, metric) => {
      const value = typeof metric.val === 'number' ? metric.val : metric.oldval ?? 0
      return sum + value
    }, 0)
    return Math.round(total / metrics.length)
  }, [metrics])

  const olderRating = useMemo(() => {
    if (!metrics.length) return 0
    const total = metrics.reduce(
      (sum, metric) => sum + (typeof metric.oldval === 'number' ? metric.oldval : metric.val ?? 0),
      0,
    )
    return Math.round(total / metrics.length)
  }, [metrics])

  const scoreDelta = totalScore - olderRating
  const scoreDirection = scoreDelta >= 0 ? 'up' : 'down'

  function handleScrollToUpload() {
    document.getElementById('upload')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleUploadClick() {
    inputRef.current?.click()
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are supported.')
      event.target.value = ''
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError('Please upload a PDF no larger than 15MB.')
      event.target.value = ''
      return
    }

    setUploadError(null)
    setUploading(true)

    try {
      const result = await analyze(file)
      setAnalysisResult(result)
      setIsResultOpen(true)
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'The profile could not be analyzed.',
      )
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return (
    <div className="rater-shell">
      <AppHeader />
      <main className="rater-main">
        <section className="rater-welcome">
          <div className="rater-copy">
            <p className="rater-kicker">Welcome back</p>
            <h1>Welcome back, {firstName}</h1>
          </div>
        </section>

        <section className="rater-rating" aria-label="Profile rating overview">
          <div className="rater-rating-card" ref={graphRef}>
            {graphLoading ? (
              <div className="graph-loading" aria-live="polite">
                <div className="graph-loading-pill" />
                <div className="graph-loading-line long" />
                <div className="graph-loading-line" />
                <div className="graph-loading-line short" />
              </div>
            ) : metrics.length === 0 ? (
              <div className="graph-empty">
                <p>Start your journey with Rater</p>
              </div>
            ) : (
              <>
                <div className="graph-panel" aria-live="polite">
                  <div className="graph-bars" role="img" aria-label="Profile metrics comparison">
                    {metrics.map((metric, index) => {
                      const paletteKey = `c${((index % 10) + 1)}` as keyof typeof COLOR_MAP
                      const palette = COLOR_MAP[paletteKey]

                      return (
                        <div key={metric.key} className="metric-column">
                          {typeof metric.oldval === 'number' && (
                            <div className="metric-bar-wrap">
                              <span
                                className="metric-tooltip"
                                style={{ background: palette.v2, color: '#fff' }}
                              >
                                {Math.round(metric.oldval)}
                              </span>
                              <div
                                className="metric-bar oldval"
                                style={{
                                  height: graphVisible ? `${toBarHeight(metric.oldval)}%` : '0%',
                                  background: palette.v2,
                                  opacity: 0.55,
                                  transitionDelay: `${index * 80}ms`,
                                }}
                              />
                            </div>
                          )}
                          {typeof metric.val === 'number' && (
                            <div className="metric-bar-wrap">
                              <span
                                className="metric-tooltip"
                                style={{ background: palette.v1, color: '#fff' }}
                              >
                                {Math.round(metric.val)}
                              </span>
                              <div
                                className="metric-bar val"
                                style={{
                                  height: graphVisible ? `${toBarHeight(metric.val)}%` : '0%',
                                  background: palette.v1,
                                  transitionDelay: `${index * 80 + 120}ms`,
                                }}
                              />
                            </div>
                          )}
                          <span className="metric-name">{metric.name}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="rater-summary">
                  <div className="score-headline">
                    <span className="score-value">{totalScore}</span>
                    <span className={`score-arrow ${scoreDirection}`} aria-hidden="true">
                      {scoreDirection === 'up' ? '▲' : '▼'}
                    </span>
                  </div>
                  <p className="older-rating">Older rating: {olderRating}</p>
                  <button className="journey-button" type="button" onClick={handleScrollToUpload}>
                    Start your journey with Rater
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="rater-upload" id="upload">
          <div className="upload-panel">
            <div className="upload-icon" aria-hidden="true">⇪</div>
            <p>Upload your LinkedIn profile PDF (max 15MB)</p>
            <button type="button" className="upload-link" onClick={() => setVideoOpen(true)}>
              How do I get my profile PDF?
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(event) => void handleFileChange(event)}
            />
            <button
              className="button button-primary"
              type="button"
              onClick={handleUploadClick}
              disabled={uploading}
            >
              {uploading ? 'Analyzing…' : 'Upload PDF'}
            </button>
            {uploadError && (
              <p className="notice notice-error upload-error" role="alert">
                {uploadError}
              </p>
            )}
            {uploading && (
              <div className="analysis-skeleton" aria-live="polite">
                <div className="skeleton-row" />
                <div className="skeleton-row short" />
                <div className="skeleton-row" />
                <div className="skeleton-row long" />
              </div>
            )}
            {isResultOpen && analysisResult !== null && (
              <div className="analysis-result">
                <button
                  type="button"
                  className="result-close"
                  onClick={() => setIsResultOpen(false)}
                  aria-label="Close result panel"
                >
                  ×
                </button>
                <pre>{JSON.stringify(analysisResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </section>
      </main>

      {videoOpen && (
        <div className="video-modal" onClick={() => setVideoOpen(false)}>
          <div
            className="video-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="How to get your LinkedIn PDF"
          >
            <button
              type="button"
              className="video-close"
              onClick={() => setVideoOpen(false)}
              aria-label="Close video help"
            >
              ×
            </button>
            <video autoPlay muted loop playsInline>
              <source
                src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
                type="video/mp4"
              />
            </video>
          </div>
        </div>
      )}
    </div>
  )
}
