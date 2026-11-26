import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnalysisModal } from "../components/AnalysisModal";
import { analysisToText, getAnalysisTitle } from "../components/analysisFormatting";
import { AppHeader } from "../components/AppHeader";
import {
  getAnalyses,
  type AnalysisRecord,
} from "../services/httpClient";

const SCORE_FIELDS = [
  "completeness",
  "content_quality",
  "keyword_and_role_relevance",
  "career_trajectory",
  "skills_depth",
  "social_proof",
  "network",
  "activity",
] as const;

function getTotalScore(record: AnalysisRecord): number {
  return Math.round(
    SCORE_FIELDS.reduce((total, field) => total + record[field], 0) /
      SCORE_FIELDS.length,
  );
}

function getPreview(value: unknown): string {
  const lines = analysisToText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Title:"));
  const preview = lines[0] ?? "Open this result to view the full analysis.";
  return preview.length > 180 ? `${preview.slice(0, 177)}…` : preview;
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function AnalysisHistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] =
    useState<AnalysisRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const history = await getAnalyses(10);
      setAnalyses(
        [...history].sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load your past analyses.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadHistory();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadHistory]);

  return (
    <div className="rater-shell">
      <AppHeader />
      <main className="rater-main analysis-history-page">
        <header className="analysis-history-page-heading">
          <div>
            <p className="analysis-history-eyebrow">YOUR PROFILE HISTORY</p>
            <h1>Past analyses</h1>
            <p>Open any review to read it, copy it, or save it as a PDF.</p>
          </div>
          <Link className="analysis-history-back" to="/">
            Back to overview
          </Link>
        </header>

        {loading && (
          <p className="analysis-history-message" role="status">
            Loading your analyses…
          </p>
        )}

        {error && (
          <div className="analysis-history-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void loadHistory()}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && analyses.length === 0 && (
          <p className="analysis-history-message">
            Your past profile analyses will appear here after you check a
            profile.
          </p>
        )}

        {analyses.length > 0 && (
          <div className="analysis-record-list">
            {analyses.map((analysis) => {
              const score = getTotalScore(analysis);
              const title =
                getAnalysisTitle(analysis.analysis_result) ??
                "LinkedIn profile analysis";

              return (
                <button
                  className="analysis-record-button"
                  key={analysis.id}
                  type="button"
                  onClick={() => setSelectedAnalysis(analysis)}
                  aria-label={`Open ${title}, score ${score} out of 100`}
                >
                  <span className="analysis-record-copy">
                    <strong>{title}</strong>
                    <span className="analysis-record-preview analysis-content">
                      {getPreview(analysis.analysis_result)}
                    </span>
                    <time dateTime={analysis.created_at}>
                      {formatCreatedAt(analysis.created_at)}
                    </time>
                  </span>
                  <span className="analysis-record-score">
                    <strong>{score}</strong>
                    <small>Overall score / 100</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {selectedAnalysis && (
        <AnalysisModal
          title={
            getAnalysisTitle(selectedAnalysis.analysis_result) ??
            "LinkedIn profile analysis"
          }
          value={selectedAnalysis.analysis_result}
          score={getTotalScore(selectedAnalysis)}
          onClose={() => setSelectedAnalysis(null)}
        />
      )}
    </div>
  );
}
