import {
  formatAnalysisKey,
  formatPrimitiveValue,
  isAnalysisBranch,
  parseAnalysisValue,
} from "./analysisFormatting";

export function AnalysisContent({
  value,
  depth = 0,
  hideTitle = false,
}: {
  value: unknown;
  depth?: number;
  hideTitle?: boolean;
}) {
  const resolved = depth === 0 ? parseAnalysisValue(value) : value;

  if (Array.isArray(resolved)) {
    if (resolved.length === 0) {
      return <p className="analysis-empty">No items</p>;
    }

    return (
      <ul className="analysis-list">
        {resolved.map((item, index) => (
          <li key={index}>
            {isAnalysisBranch(item) ? (
              <AnalysisContent value={item} depth={depth + 1} />
            ) : (
              <span className="analysis-leaf">
                {formatPrimitiveValue(item)}
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (isAnalysisBranch(resolved)) {
    const entries = Object.entries(resolved).filter(
      ([key]) => !(hideTitle && depth === 0 && key.toLowerCase() === "title"),
    );
    if (entries.length === 0) {
      return <p className="analysis-empty">No details</p>;
    }

    return (
      <div className="analysis-fields" data-depth={Math.min(depth, 8)}>
        {entries.map(([key, child]) => (
          <section
            className="analysis-entry"
            data-depth={Math.min(depth, 8)}
            key={key}
          >
            <h3>{formatAnalysisKey(key)}</h3>
            {isAnalysisBranch(child) ? (
              <AnalysisContent value={child} depth={depth + 1} />
            ) : (
              <p className="analysis-leaf">{formatPrimitiveValue(child)}</p>
            )}
          </section>
        ))}
      </div>
    );
  }

  return <p className="analysis-leaf">{formatPrimitiveValue(resolved)}</p>;
}
