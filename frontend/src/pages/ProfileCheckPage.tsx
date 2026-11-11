import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
} from 'react'
import { useAuth } from '../auth/AuthContext'
import { AppHeader } from '../components/AppHeader'
import {
  analyze,
  COLOR_MAP,
  getGraph,
  type GraphResponse,
} from '../services/httpClient'

/* -------------------------------------------------------------------------- */
/*  Config                                                                    */
/* -------------------------------------------------------------------------- */

const MAX_FILE_SIZE = 15 * 1024 * 1024
const Y_TICKS = [100, 80, 60, 40, 20, 0]

const FALLBACK_PALETTE = { v1: '#0a66c2', v2: '#9dc9ed' }

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

type Metric = { key: string; name: string; val?: number; oldval?: number }

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function toBarHeight(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return clamp(value)
}

function getMetricEntries(response: GraphResponse | null): Metric[] {
  if (!response) return []

  return Object.entries(response)
    .filter(
      ([, metric]) =>
        metric && (typeof metric.val === 'number' || typeof metric.oldval === 'number'),
    )
    .map(([key, metric]) => ({
      key,
      name: metric.name || key,
      val: metric.val,
      oldval: metric.oldval,
    }))
}

function currentOf(m: Metric): number {
  return typeof m.val === 'number' ? m.val : (m.oldval ?? 0)
}

function previousOf(m: Metric): number {
  return typeof m.oldval === 'number' ? m.oldval : (m.val ?? 0)
}

function gradeFor(score: number): string {
  if (score >= 80) return 'Strong profile'
  if (score >= 60) return 'Solid, with room to grow'
  if (score >= 40) return 'Developing'
  return 'Needs attention'
}

function formatDelta(delta: number): string {
  if (delta === 0) return '0'
  return `${delta > 0 ? '+' : '−'}${Math.abs(Math.round(delta))}`
}

function formatAnalysisKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()

  return words ? words[0].toUpperCase() + words.slice(1) : 'Untitled'
}

function isAnalysisBranch(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null
}

function AnalysisValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="analysis-empty">No items</span>
    }

    return (
      <ol className="analysis-list">
        {value.map((item, index) => (
          <li key={index}>
            <AnalysisEntry label={`Item ${index + 1}`} value={item} depth={depth} />
          </li>
        ))}
      </ol>
    )
  }

  if (isAnalysisBranch(value)) {
    const entries = Object.entries(value)

    if (entries.length === 0) {
      return <span className="analysis-empty">No details</span>
    }

    return (
      <dl className="analysis-fields">
        {entries.map(([key, child]) => (
          <AnalysisEntry key={key} label={key} value={child} depth={depth} />
        ))}
      </dl>
    )
  }

  if (value === null || typeof value === 'undefined') {
    return <span className="analysis-empty">Not provided</span>
  }

  if (typeof value === 'boolean') {
    return <span>{value ? 'Yes' : 'No'}</span>
  }

  return <span className="analysis-leaf">{String(value)}</span>
}

function AnalysisEntry({
  label,
  value,
  depth,
}: {
  label: string
  value: unknown
  depth: number
}) {
  const fontSize = `${Math.max(0.76, 1.04 - depth * 0.055)}rem`

  return (
    <div className="analysis-entry" data-depth={Math.min(depth, 8)}>
      <dt style={{ fontSize }}>{formatAnalysisKey(label)}</dt>
      <dd style={{ fontSize }}>
        <AnalysisValue value={value} depth={depth + 1} />
      </dd>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function ProfileCheckPage() {
  const { user } = useAuth()
  const graphRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [graphLoading, setGraphLoading] = useState(true)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [graphVisible, setGraphVisible] = useState(false)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const [videoOpen, setVideoOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<unknown>(null)
  const [isResultOpen, setIsResultOpen] = useState(false)

  const loadGraph = useCallback(async () => {
    setGraphLoading(true)
    setGraphError(null)

    try {
      setGraph(await getGraph())
    } catch (error) {
      setGraphError(
        error instanceof Error ? error.message : 'Could not load profile metrics.',
      )
    } finally {
      setGraphLoading(false)
    }
  }, [])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadGraph()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadGraph])

  /* ---- Animate bars when the chart scrolls into view -------------------- */
  useEffect(() => {
    const node = graphRef.current
    if (!node || graphLoading) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      const id = window.setTimeout(() => setGraphVisible(true), 0)
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

  /* ---- Close video modal on Escape -------------------------------------- */
  useEffect(() => {
    if (!videoOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVideoOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [videoOpen])

  /* ---- Derived ---------------------------------------------------------- */
  const metrics = useMemo(() => getMetricEntries(graph), [graph])
  const hasData = metrics.length > 0
  const firstName = user?.firstName || user?.name?.split(/\s+/)[0] || 'Friend'

  const totalScore = useMemo(() => {
    if (!hasData) return 0
    return Math.round(metrics.reduce((s, m) => s + currentOf(m), 0) / metrics.length)
  }, [metrics, hasData])

  const olderRating = useMemo(() => {
    if (!hasData) return 0
    return Math.round(metrics.reduce((s, m) => s + previousOf(m), 0) / metrics.length)
  }, [metrics, hasData])

  const scoreDelta = totalScore - olderRating
  const scoreDirection = scoreDelta >= 0 ? 'up' : 'down'

  const focusAreas = useMemo(
    () => [...metrics].sort((a, b) => currentOf(a) - currentOf(b)).slice(0, 2),
    [metrics],
  )

  const columns = metrics

  /* ---- Upload ----------------------------------------------------------- */
  function handleUploadClick() {
    inputRef.current?.click()
  }

  async function processFile(file: File) {
    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are supported. Export your LinkedIn profile as a PDF and try again.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('That PDF is larger than 15 MB. Export a smaller version and try again.')
      return
    }

    setUploadError(null)
    setUploading(true)
    setIsResultOpen(false)

    try {
      const result = await analyze(file)
      setAnalysisResult(result)
      setIsResultOpen(true)
      setUploading(false)
      await loadGraph()
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'We couldn’t analyze this profile. Try again.',
      )
    } finally {
      setUploading(false)
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await processFile(file)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    if (uploading) return
    const file = event.dataTransfer.files?.[0]
    if (file) void processFile(file)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (!uploading) setDragActive(true)
  }

  /* ---- Render ----------------------------------------------------------- */
  return (
    <div className="rater-shell">
      <AppHeader />
      <main className="rater-main">
        <section className="rater-welcome">
          <h1>Welcome back, {firstName}</h1>
          <p className="rater-subtitle">
            {graphError
              ? 'Your live profile metrics are temporarily unavailable.'
              : hasData
                ? 'Here is how your profile reads to recruiters right now.'
                : 'Upload your LinkedIn PDF to see how your profile scores.'}
          </p>
        </section>

        {/* ------------------------------ Dashboard ------------------------------ */}
        <section className="rater-dashboard" aria-label="Profile rating overview">
          {/* Chart ------------------------------------------------------------- */}
          <div className="chart-card" ref={graphRef}>
            <header className="chart-head">
              <div>
                <h2>Profile metrics</h2>
                <p>Score out of 100 for each section</p>
              </div>
              <ul className="chart-legend" aria-label="Legend">
                <li>
                  <i className="legend-swatch legend-prev" /> Previous
                </li>
                <li>
                  <i className="legend-swatch legend-curr" /> Current
                </li>
              </ul>
            </header>

            <div className="chart" role="img" aria-label="Profile metrics, previous versus current">
              {/* Y axis */}
              <div className="chart-yaxis" aria-hidden="true">
                {Y_TICKS.map((tick) => (
                  <span key={tick} style={{ bottom: `${tick}%` }}>
                    {tick}
                  </span>
                ))}
              </div>

              {/* Plot */}
              <div className="chart-plot">
                <div className="chart-grid" aria-hidden="true">
                  {Y_TICKS.map((tick) => (
                    <i key={tick} className={tick === 0 ? 'baseline' : ''} style={{ bottom: `${tick}%` }} />
                  ))}
                </div>

                <div className="chart-bars">
                  {columns.map((metric, index) => {
                    const paletteKey = `c${(index % 10) + 1}` as keyof typeof COLOR_MAP
                    const palette = COLOR_MAP?.[paletteKey] ?? FALLBACK_PALETTE
                    const showBars = hasData && !graphLoading
                    const dim = activeKey !== null && activeKey !== metric.key

                    return (
                      <div
                        key={metric.key}
                        className={`chart-col${dim ? ' is-dim' : ''}`}
                        onMouseEnter={() => hasData && setActiveKey(metric.key)}
                        onMouseLeave={() => setActiveKey(null)}
                      >
                        {showBars && typeof metric.oldval === 'number' && (
                          <div className="bar-wrap">
                            <span className="bar-tip" style={{ background: palette.v2 }}>
                              {Math.round(metric.oldval)}
                            </span>
                            <div
                              className="bar bar-prev"
                              style={{
                                height: graphVisible ? `${toBarHeight(metric.oldval)}%` : '0%',
                                background: palette.v2,
                                transitionDelay: `${index * 70}ms`,
                              }}
                            />
                          </div>
                        )}
                        {showBars && typeof metric.val === 'number' && (
                          <div className="bar-wrap">
                            <span className="bar-tip" style={{ background: palette.v1 }}>
                              {Math.round(metric.val)}
                            </span>
                            <div
                              className="bar bar-curr"
                              style={{
                                height: graphVisible ? `${toBarHeight(metric.val)}%` : '0%',
                                background: palette.v1,
                                transitionDelay: `${index * 70 + 110}ms`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {graphLoading && (
                  <div className="chart-overlay" aria-live="polite">
                    <span className="chart-spinner" />
                    Loading your metrics…
                  </div>
                )}

                {!graphLoading && graphError && (
                  <div className="chart-overlay chart-empty" role="alert">
                    <strong>Couldn’t load your metrics</strong>
                    <span>{graphError}</span>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => void loadGraph()}
                    >
                      Try again
                    </button>
                  </div>
                )}

                {!graphLoading && !graphError && !hasData && (
                  <div className="chart-overlay chart-empty">
                    <strong>No scores yet</strong>
                    <span>Upload your LinkedIn PDF to request a profile analysis.</span>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={handleUploadClick}
                    >
                      Upload PDF
                    </button>
                  </div>
                )}
              </div>

              {/* X axis */}
              <div className="chart-xaxis">
                {columns.map((metric) => (
                  <span key={metric.key} className={activeKey === metric.key ? 'is-active' : ''}>
                    {metric.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Summary ----------------------------------------------------------- */}
          <aside className="summary-card" aria-label="Score summary">
            <div
              className={`score-ring${hasData ? '' : ' is-empty'}`}
              style={{ '--pct': hasData ? totalScore : 0 } as CSSProperties}
            >
              <div className="score-ring-inner">
                <span className="score-value">{hasData ? totalScore : '—'}</span>
                <span className="score-max">/ 100</span>
              </div>
            </div>

            {hasData ? (
              <>
                <p className="score-grade">{gradeFor(totalScore)}</p>
                <p className={`score-delta ${scoreDirection}`}>
                  <span aria-hidden="true">{scoreDirection === 'up' ? '▲' : '▼'}</span>
                  {formatDelta(scoreDelta)} since your last check
                  <span className="older-rating"> (was {olderRating})</span>
                </p>

                <div className="focus">
                  <h3>Work on these first</h3>
                  <ul>
                    {focusAreas.map((m) => (
                      <li key={m.key}>
                        <span>{m.name}</span>
                        <b>{Math.round(currentOf(m))}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : graphError ? (
              <p className="score-grade muted">Your profile scores could not be loaded.</p>
            ) : (
              <p className="score-grade muted">Your score appears here after your first upload.</p>
            )}
          </aside>

          {/* Breakdown --------------------------------------------------------- */}
          {hasData && (
            <div className="breakdown-card">
              <h2>Breakdown</h2>
              <ul className="breakdown-list">
                {metrics.map((m, index) => {
                  const paletteKey = `c${(index % 10) + 1}` as keyof typeof COLOR_MAP
                  const palette = COLOR_MAP?.[paletteKey] ?? FALLBACK_PALETTE
                  const delta = currentOf(m) - previousOf(m)

                  return (
                    <li
                      key={m.key}
                      onMouseEnter={() => setActiveKey(m.key)}
                      onMouseLeave={() => setActiveKey(null)}
                    >
                      <span className="breakdown-name">{m.name}</span>
                      <div className="breakdown-track">
                        <div
                          className="breakdown-fill"
                          style={{
                            width: graphVisible ? `${toBarHeight(currentOf(m))}%` : '0%',
                            background: palette.v1,
                            transitionDelay: `${index * 70}ms`,
                          }}
                        />
                      </div>
                      <b className="breakdown-value">{Math.round(currentOf(m))}</b>
                      <span className={`delta-chip ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}`}>
                        {formatDelta(delta)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>

        {/* -------------------------------- Upload -------------------------------- */}
        <section className="rater-upload" id="upload">
          <div
            className={`upload-panel${dragActive ? ' is-drag' : ''}${uploading ? ' is-busy' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <div className="upload-icon" aria-hidden="true">
              ⇪
            </div>
            <h2>Check your LinkedIn profile</h2>
            <p>Drop your profile PDF here, or choose a file. Max 15 MB.</p>

            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(event) => void handleFileChange(event)}
            />

            <div className="upload-actions">
              <button className="button button-primary" type="button" onClick={handleUploadClick} disabled={uploading}>
                {uploading ? 'Analyzing…' : 'Upload PDF'}
              </button>
              <button type="button" className="upload-link" onClick={() => setVideoOpen(true)}>
                How do I get my profile PDF?
              </button>
            </div>

            {uploadError && (
              <p className="notice notice-error upload-error" role="alert">
                {uploadError}
              </p>
            )}

            {uploading && (
              <div className="analysis-skeleton" role="status" aria-label="Analyzing profile">
                <ul className="analysis-skeleton-list" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, index) => (
                    <li
                      className="analysis-skeleton-item"
                      key={index}
                      style={{ animationDelay: `${index * -0.46}s` }}
                    >
                      <span className="skeleton-marker" />
                      <span className="skeleton-copy">
                        <i className="skeleton-line skeleton-line-title" />
                        <i className="skeleton-line skeleton-line-detail" />
                      </span>
                      <i className="skeleton-score" />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isResultOpen && analysisResult !== null && (
              <div className="analysis-result border-grad shadow-sm">
                <div className="analysis-result-head">
                  <b>Analysis result</b>
                  <button
                    type="button"
                    className="result-close"
                    onClick={() => setIsResultOpen(false)}
                    aria-label="Close result panel"
                  >
                    ×
                  </button>
                </div>
                <div className="analysis-result-content">
                  <AnalysisValue value={analysisResult} />
                </div>
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