import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { AppHeader } from "../components/AppHeader";
import {
  analyze,
  COLOR_MAP,
  getAnalyses,
  type AnalysisRecord,
} from "../services/httpClient";
import { profileService } from "../services/profileService";

/* -------------------------------------------------------------------------- */
/*  Config                                                                    */
/* -------------------------------------------------------------------------- */

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const DURATION_SECONDS = {
  hours: 60 * 60,
  days: 24 * 60 * 60,
  months: 30 * 24 * 60 * 60,
} as const;
const DURATION_MAX = { hours: 6 * 30 * 24, days: 6 * 30, months: 6 } as const;
const Y_TICKS = [100, 80, 60, 40, 20, 0];

const GRAPH_COLORS = Object.values(COLOR_MAP);
const ANALYSIS_HISTORY_LIMIT = 10;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

type AnalysisMetricKey =
  | "completeness"
  | "content_quality"
  | "keyword_and_role_relevance"
  | "career_trajectory"
  | "skills_depth"
  | "social_proof"
  | "network"
  | "activity";

type Metric = {
  key: AnalysisMetricKey;
  name: string;
  val: number;
  olderAverage?: number;
};

const METRICS: { key: AnalysisMetricKey; name: string }[] = [
  { key: "completeness", name: "Completeness" },
  { key: "content_quality", name: "Content quality" },
  { key: "keyword_and_role_relevance", name: "Keyword and role relevance" },
  { key: "career_trajectory", name: "Career trajectory" },
  { key: "skills_depth", name: "Skills depth" },
  { key: "social_proof", name: "Social proof" },
  { key: "network", name: "Network" },
  { key: "activity", name: "Activity" },
];

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function toBarHeight(value?: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return clamp(value);
}

function getMetricEntries(analyses: AnalysisRecord[]): Metric[] {
  const [current, ...older] = analyses;
  if (!current) return [];

  return METRICS.map(({ key, name }) => {
    const olderScores = older.map((analysis) => analysis[key]);
    const olderAverage = olderScores.length
      ? olderScores.reduce((total, score) => total + score, 0) /
        olderScores.length
      : undefined;

    return {
      key,
      name,
      val: current[key],
      olderAverage,
    };
  });
}

function getBarStyle(
  metricIndex: number,
  barIndex: number,
  barCount: number,
): CSSProperties {
  const color = GRAPH_COLORS[metricIndex % GRAPH_COLORS.length];
  const opacity = barCount < 2 ? 1 : 0.55 + (barIndex / (barCount - 1)) * 0.45;
  return { backgroundColor: color, opacity };
}

function gradeFor(score: number): string {
  if (score >= 80) return "Strong profile";
  if (score >= 60) return "Solid, with room to grow";
  if (score >= 40) return "Developing";
  return "Needs attention";
}

function formatDelta(delta: number): string {
  if (delta === 0) return "0";
  return `${delta > 0 ? "+" : "−"}${Math.abs(Math.round(delta))}`;
}

function formatAnalysisKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  return words ? words[0].toUpperCase() + words.slice(1) : "Untitled";
}

function isAnalysisBranch(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

function parseAnalysisValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function formatPrimitiveValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function getDepthScale(depth: number) {
  const d = Math.max(0, Math.min(depth, 8));
  return {
    fontSize: `${Math.max(0.76, 1.04 - d * 0.05)}rem`,
    padding: `${Math.max(8, 16 - d * 1.2)}px ${Math.max(12, 20 - d * 1.2)}px`,
    gap: `${Math.max(6, 12 - d)}px`,
    indent: `${d * 14}px`,
    dotSize: `${Math.max(6, 10 - d * 0.6)}px`,
  };
}

function AnalysisValue({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}) {
  const resolved = depth === 0 ? parseAnalysisValue(value) : value;
  const scale = getDepthScale(depth);

  if (Array.isArray(resolved)) {
    if (resolved.length === 0) {
      return (
        <div
          className="analysis-row-card"
          style={{
            padding: scale.padding,
            marginLeft: scale.indent,
            fontSize: scale.fontSize,
          }}
        >
          <span className="analysis-empty">No items</span>
        </div>
      );
    }

    return (
      <div
        className="analysis-card-stack"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: scale.gap,
          marginLeft: scale.indent,
        }}
      >
        {resolved.map((item, index) => (
          <AnalysisRowCard
            key={index}
            label={`Item ${index + 1}`}
            value={item}
            depth={depth}
            index={index}
          />
        ))}
      </div>
    );
  }

  if (isAnalysisBranch(resolved)) {
    const entries = Object.entries(resolved);
    if (entries.length === 0) {
      return (
        <div
          className="analysis-row-card"
          style={{
            padding: scale.padding,
            marginLeft: scale.indent,
            fontSize: scale.fontSize,
          }}
        >
          <span className="analysis-empty">No details</span>
        </div>
      );
    }

    return (
      <div
        className="analysis-card-stack"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: scale.gap,
          marginLeft: scale.indent,
        }}
      >
        {entries.map(([key, child], index) => (
          <AnalysisRowCard
            key={key}
            label={key}
            value={child}
            depth={depth}
            index={index}
          />
        ))}
      </div>
    );
  }

  return (
    <span className="analysis-leaf" style={{ fontSize: scale.fontSize }}>
      {formatPrimitiveValue(resolved)}
    </span>
  );
}

function AnalysisRowCard({
  label,
  value,
  depth,
  index,
}: {
  label: string;
  value: unknown;
  depth: number;
  index: number;
}) {
  const scale = getDepthScale(depth);
  const accent = GRAPH_COLORS[index % GRAPH_COLORS.length];
  const isBranch = isAnalysisBranch(value);

  const badgeText = useMemo(() => {
    if (Array.isArray(value)) return `${value.length}`;
    if (isAnalysisBranch(value)) return `${Object.keys(value).length}`;
    if (typeof value === "number") return `${value}`;
    return null;
  }, [value]);

  return (
    <div
      className="analysis-row-card"
      data-depth={Math.min(depth, 8)}
      style={{
        display: "flex",
        alignItems: isBranch ? "flex-start" : "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: scale.padding,
        fontSize: scale.fontSize,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: isBranch ? "flex-start" : "center",
          gap: "12px",
          flex: 1,
          minWidth: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: scale.dotSize,
            height: scale.dotSize,
            borderRadius: "999px",
            backgroundColor: accent,
            opacity: 0.75,
            flexShrink: 0,
            marginTop: isBranch ? "0.35em" : 0,
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            flex: 1,
            minWidth: 0,
          }}
        >
          <strong style={{ fontSize: scale.fontSize }}>
            {formatAnalysisKey(label)}
          </strong>

          {isBranch ? (
            <AnalysisValue value={value} depth={depth + 1} />
          ) : (
            <span
              className="analysis-leaf"
              style={{ fontSize: scale.fontSize }}
            >
              {formatPrimitiveValue(value)}
            </span>
          )}
        </div>
      </div>

      {badgeText !== null && (
        <span
          className="analysis-row-badge"
          style={{
            fontSize: `calc(${scale.fontSize} * 0.88)`,
            flexShrink: 0,
          }}
        >
          {badgeText}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export function ProfileCheckPage() {
  const { user } = useAuth();
  const graphRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pdfHelpCloseRef = useRef<HTMLButtonElement | null>(null);

  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [graphVisible, setGraphVisible] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [pdfHelpOpen, setPdfHelpOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<unknown>(null);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [durationAmount, setDurationAmount] = useState("24");
  const [durationUnit, setDurationUnit] =
    useState<keyof typeof DURATION_SECONDS>("hours");
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  const loadAnalyses = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const history = await getAnalyses(ANALYSIS_HISTORY_LIMIT);
      setAnalyses(history);
      setGraphVisible(false);
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Could not load your analysis history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadAnalyses();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadAnalyses]);

  /* ---- Animate bars when the chart scrolls into view -------------------- */
  useEffect(() => {
    const node = graphRef.current;
    if (!node || analyses.length === 0) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      const id = window.setTimeout(() => setGraphVisible(true), 0);
      return () => window.clearTimeout(id);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setGraphVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [analyses]);

  /* ---- Close PDF help on Escape ----------------------------------------- */
  useEffect(() => {
    if (!pdfHelpOpen) return;

    const previousFocus = document.activeElement;
    pdfHelpCloseRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPdfHelpOpen(false);
      } else if (event.key === "Tab") {
        event.preventDefault();
        pdfHelpCloseRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [pdfHelpOpen]);

  /* ---- Derived ---------------------------------------------------------- */
  const metrics = useMemo(() => getMetricEntries(analyses), [analyses]);
  const hasData = metrics.length > 0;
  const hasOlderData = analyses.length > 1;
  const firstName = user?.firstName || user?.name?.split(/\s+/)[0] || "Friend";

  const totalScore = useMemo(() => {
    if (!hasData) return 0;
    return Math.round(
      metrics.reduce((total, metric) => total + metric.val, 0) / metrics.length,
    );
  }, [metrics, hasData]);

  const olderRating = useMemo(() => {
    const olderMetrics = metrics.filter(
      (metric) => typeof metric.olderAverage === "number",
    );
    if (olderMetrics.length === 0) return null;
    return Math.round(
      olderMetrics.reduce(
        (total, metric) => total + (metric.olderAverage ?? 0),
        0,
      ) / olderMetrics.length,
    );
  }, [metrics]);

  const scoreDelta = olderRating === null ? null : totalScore - olderRating;
  const scoreDirection = scoreDelta === null || scoreDelta >= 0 ? "up" : "down";

  const focusAreas = useMemo(
    () => [...metrics].sort((a, b) => a.val - b.val).slice(0, 2),
    [metrics],
  );

  const columns = metrics;

  /* ---- Upload ----------------------------------------------------------- */
  function handleUploadClick() {
    inputRef.current?.click();
  }

  async function processFile(file: File) {
    if (file.type !== "application/pdf") {
      setUploadError(
        "Only PDF files are supported. Export your LinkedIn profile as a PDF and try again.",
      );
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(
        "That PDF is larger than 15 MB. Export a smaller version and try again.",
      );
      return;
    }

    setUploadError(null);
    setUploading(true);
    setIsResultOpen(false);

    try {
      const result = await analyze(file);
      setAnalysisResult(result);
      setIsResultOpen(true);
      await loadAnalyses();
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "We couldn’t analyze this profile. Try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(durationAmount);
    if (
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > DURATION_MAX[durationUnit]
    ) {
      setMagicLinkError(
        `Enter a whole number from 1 to ${DURATION_MAX[durationUnit]} ${durationUnit}.`,
      );
      return;
    }

    setMagicLinkError(null);
    setMagicLink(null);
    setMagicLinkLoading(true);
    try {
      const durationSeconds = amount * DURATION_SECONDS[durationUnit];
      setMagicLink(await profileService.generateMagicLink(durationSeconds));
    } catch (error) {
      setMagicLinkError(
        error instanceof Error
          ? error.message
          : "Could not generate the magic link.",
      );
    } finally {
      setMagicLinkLoading(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await processFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (uploading) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!uploading) setDragActive(true);
  }

  /* ---- Render ----------------------------------------------------------- */
  return (
    <div className="rater-shell" style={{ overflow: "visible", height: "auto" }}>
      <AppHeader />
      <main className="rater-main" style={{ overflow: "visible", height: "auto" }}>
        <section className="rater-welcome">
          <h1>Welcome back, {firstName}</h1>
          <p className="rater-subtitle">
            {hasData
              ? "Here is how your profile reads to recruiters right now."
              : "Upload your LinkedIn PDF to see how your profile scores."}
          </p>
        </section>

        {/* ------------------------------ Dashboard ------------------------------ */}
        <section
          className="rater-dashboard"
          aria-label="Profile rating overview"
        >
          {/* Chart ------------------------------------------------------------- */}
          <div className="chart-card" ref={graphRef}>
            <header className="chart-head">
              <div>
                <h2>Profile metrics</h2>
                <p>
                  Current score compared with the average of earlier analyses
                </p>
              </div>
              <ul className="chart-legend" aria-label="Legend">
                {hasOlderData && (
                  <li>
                    <i className="legend-swatch legend-prev" /> Older average
                  </li>
                )}
                {hasData && (
                  <li>
                    <i className="legend-swatch legend-curr" /> Current
                  </li>
                )}
              </ul>
            </header>

            {historyError && hasData && (
              <p className="notice notice-error" role="alert">
                Could not refresh analysis history: {historyError}{" "}
                <button
                  type="button"
                  className="upload-link"
                  onClick={() => void loadAnalyses()}
                >
                  Retry
                </button>
              </p>
            )}

            <div
              className="chart"
              role="img"
              aria-label="Current profile metrics compared with the older average"
            >
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
                    <i
                      key={tick}
                      className={tick === 0 ? "baseline" : ""}
                      style={{ bottom: `${tick}%` }}
                    />
                  ))}
                </div>

                <div className="chart-bars">
                  {columns.map((metric, index) => {
                    const dim = activeKey !== null && activeKey !== metric.key;
                    const bars = [
                      ...(typeof metric.olderAverage === "number"
                        ? [
                            {
                              key: "older",
                              value: metric.olderAverage,
                              className: "bar-prev",
                            },
                          ]
                        : []),
                      {
                        key: "current",
                        value: metric.val,
                        className: "bar-curr",
                      },
                    ];

                    return (
                      <div
                        key={metric.key}
                        className={`chart-col${dim ? " is-dim" : ""}`}
                        onMouseEnter={() => setActiveKey(metric.key)}
                        onMouseLeave={() => setActiveKey(null)}
                      >
                        {bars.map((bar, barIndex) => {
                          const colorStyle = getBarStyle(
                            index,
                            barIndex,
                            bars.length,
                          );
                          return (
                            <div className="bar-wrap" key={bar.key}>
                              <span className="bar-tip" style={colorStyle}>
                                {Math.round(bar.value)}
                              </span>
                              <div
                                className={`bar ${bar.className}`}
                                style={{
                                  ...colorStyle,
                                  height: graphVisible
                                    ? `${toBarHeight(bar.value)}%`
                                    : "0%",
                                  transitionDelay: `${index * 70 + barIndex * 110}ms`,
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {historyLoading && (
                  <div className="chart-overlay" aria-live="polite">
                    <span className="chart-spinner" />
                    Loading your analysis history…
                  </div>
                )}

                {!historyLoading && historyError && !hasData && (
                  <div className="chart-overlay chart-empty" role="alert">
                    <strong>Couldn’t load your scores</strong>
                    <span>{historyError}</span>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => void loadAnalyses()}
                    >
                      Try again
                    </button>
                  </div>
                )}

                {!historyLoading && !historyError && !hasData && (
                  <div className="chart-overlay chart-empty">
                    <strong>No scores yet</strong>
                    <span>
                      Upload your LinkedIn PDF to request a profile analysis.
                    </span>
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
                  <span
                    key={metric.key}
                    className={activeKey === metric.key ? "is-active" : ""}
                  >
                    {metric.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Summary ----------------------------------------------------------- */}
          <aside className="summary-card" aria-label="Score summary">
            <div
              className={`score-ring${hasData ? "" : " is-empty"}`}
              style={{ "--pct": hasData ? totalScore : 0 } as CSSProperties}
            >
              <div className="score-ring-inner">
                <span className="score-value">
                  {hasData ? totalScore : "—"}
                </span>
                <span className="score-max">/ 100</span>
              </div>
            </div>

            {hasData ? (
              <>
                <p className="score-grade">{gradeFor(totalScore)}</p>
                {scoreDelta !== null ? (
                  <p className={`score-delta ${scoreDirection}`}>
                    <span aria-hidden="true">
                      {scoreDirection === "up" ? "▲" : "▼"}
                    </span>
                    {formatDelta(scoreDelta)} vs. older average
                    <span className="older-rating"> ({olderRating})</span>
                  </p>
                ) : (
                  <p className="score-grade muted">
                    Your first analysis. An older average will appear after your
                    next check.
                  </p>
                )}

                <div className="focus">
                  <h3>Work on these first</h3>
                  <ul>
                    {focusAreas.map((m) => (
                      <li key={m.key}>
                        <span>{m.name}</span>
                        <b>{Math.round(m.val)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="score-grade muted">
                Your score appears here after an analysis in this session.
              </p>
            )}
          </aside>

          {/* Breakdown --------------------------------------------------------- */}
          {hasData && (
            <div className="breakdown-card">
              <h2>Breakdown</h2>
              <ul className="breakdown-list">
                {metrics.map((m, index) => {
                  const colorStyle = getBarStyle(
                    index,
                    hasOlderData ? 1 : 0,
                    hasOlderData ? 2 : 1,
                  );
                  const delta =
                    typeof m.olderAverage === "number"
                      ? m.val - m.olderAverage
                      : null;

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
                            width: graphVisible
                              ? `${toBarHeight(m.val)}%`
                              : "0%",
                            ...colorStyle,
                            transitionDelay: `${index * 70}ms`,
                          }}
                        />
                      </div>
                      <b className="breakdown-value">{Math.round(m.val)}</b>
                      <span
                        className={`delta-chip ${delta === null ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat"}`}
                      >
                        {delta === null ? "New" : formatDelta(delta)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* -------------------------------- Upload -------------------------------- */}
        <section
          className="rater-upload"
          id="upload"
          style={{ overflow: "visible", height: "auto" }}
        >
          <div
            className={`upload-panel${dragActive ? " is-drag" : ""}${uploading ? " is-busy" : ""}`}
            style={{ overflow: "visible", height: "auto", maxHeight: "none" }}
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
              <button
                className="button button-primary"
                type="button"
                onClick={handleUploadClick}
                disabled={uploading}
              >
                {uploading ? "Analyzing…" : "Upload PDF"}
              </button>
              <button
                type="button"
                className="upload-link"
                onClick={() => setPdfHelpOpen(true)}
              >
                How do I get my profile PDF?
              </button>
            </div>

            {uploadError && (
              <p className="notice notice-error upload-error" role="alert">
                {uploadError}
              </p>
            )}

            {uploading && (
              <div
                className="analysis-skeleton"
                role="status"
                aria-label="Analyzing profile"
              >
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
          </div>

          {isResultOpen && (
            <div
              className="analysis-result border-grad shadow-sm"
   style={{
                width: "100%",
                maxWidth: "820px",
                marginInline: "auto",
                alignSelf: "center",
                maxHeight: "none",
                height: "auto",
                overflow: "visible",
              }}
            >
              <div className="analysis-result-head">
                <b>Your Profile Analysis</b>
                <button
                  type="button"
                  className="result-close"
                  onClick={() => setIsResultOpen(false)}
                  aria-label="Close result panel"
                >
                  ×
                </button>
              </div>
              <div
                className="analysis-result-content"
                style={{
                  maxHeight: "none",
                  height: "auto",
                  overflow: "visible",
                }}
              >
                <AnalysisValue value={analysisResult} />
              </div>
            </div>
          )}
        </section>

        {user?.role === "admin" && (
          <section
            className="admin-magic-link"
            aria-labelledby="magic-link-title"
          >
            <div className="admin-magic-link-copy">
              <span className="admin-label">ADMIN TOOL</span>
              <h2 id="magic-link-title">Create a magic link</h2>
              <p>Generate a temporary sign-in link with a custom expiry.</p>
            </div>

            <form
              className="magic-link-form"
              onSubmit={(event) => void handleMagicLinkSubmit(event)}
            >
              <label htmlFor="magic-link-duration">Duration</label>
              <div className="magic-link-duration">
                <input
                  id="magic-link-duration"
                  type="number"
                  min={1}
                  max={DURATION_MAX[durationUnit]}
                  step={1}
                  required
                  value={durationAmount}
                  onChange={(event) => setDurationAmount(event.target.value)}
                  aria-describedby="magic-link-duration-help"
                />
                <select
                  aria-label="Duration unit"
                  value={durationUnit}
                  onChange={(event) => {
                    const unit = event.target
                      .value as keyof typeof DURATION_SECONDS;
                    setDurationUnit(unit);
                    setDurationAmount(unit === "hours" ? "24" : "1");
                  }}
                >
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="months">Months</option>
                </select>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={magicLinkLoading}
                >
                  {magicLinkLoading ? "Generating…" : "Generate link"}
                </button>
              </div>
              <small id="magic-link-duration-help">
                From 1 hour to 6 months. One month is calculated as 30 days.
              </small>

              {magicLinkError && (
                <p className="magic-link-message is-error" role="alert">
                  {magicLinkError}
                </p>
              )}
              {magicLink && (
                <p className="magic-link-message is-success" role="status">
                  Magic link created:{" "}
                  <a href={magicLink} target="_blank" rel="noreferrer">
                    {magicLink}
                  </a>
                </p>
              )}
            </form>
          </section>
        )}
      </main>
      {pdfHelpOpen && (
        <div className="pdf-help-modal" onClick={() => setPdfHelpOpen(false)}>
          <div
            className="pdf-help-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-help-title"
          >
            <button
              ref={pdfHelpCloseRef}
              type="button"
              className="pdf-help-close"
              onClick={() => setPdfHelpOpen(false)}
              aria-label="Close PDF instructions"
            >
              ×
            </button>

            <span className="eyebrow">GET YOUR PROFILE PDF</span>

            <h2 id="pdf-help-title">Save your LinkedIn profile as a PDF</h2>

            <div className="pdf-video-container">
              <video controls playsInline preload="metadata">
                <source src="../../linked-guide.mp4" type="video/mp4" />
                Your browser does not support video playback.
              </video>
            </div>

            <ol>
              <li>Open your profile on LinkedIn.</li>
              <li>
                Choose <strong>More</strong> in your profile introduction.
              </li>
              <li>
                Select <strong>Save to PDF</strong>, then save the file.
              </li>
              <li>Return here and upload the PDF (up to 15 MB).</li>
            </ol>

            <p>
              Only upload a file you have permission to share. Your PDF will be
              sent to Profile Rater for analysis.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}