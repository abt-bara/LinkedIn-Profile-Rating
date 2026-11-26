export function formatAnalysisKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  return words ? words[0].toUpperCase() + words.slice(1) : "Untitled";
}

export function isAnalysisBranch(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

export function parseAnalysisValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function getAnalysisTitle(value: unknown): string | null {
  const resolved = parseAnalysisValue(value);
  if (
    isAnalysisBranch(resolved) &&
    !Array.isArray(resolved) &&
    typeof resolved.title === "string" &&
    resolved.title.trim()
  ) {
    return resolved.title;
  }
  return null;
}

export function formatPrimitiveValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function entryToText(label: string, value: unknown, depth: number): string {
  const pad = "  ".repeat(depth);
  const title = formatAnalysisKey(label);
  if (isAnalysisBranch(value)) {
    return `${pad}${title}:\n${analysisToText(value, depth + 1)}`;
  }
  return `${pad}${title}: ${formatPrimitiveValue(value)}`;
}

export function analysisToText(value: unknown, depth = 0): string {
  const resolved = depth === 0 ? parseAnalysisValue(value) : value;
  const pad = "  ".repeat(depth);

  if (Array.isArray(resolved)) {
    if (resolved.length === 0) return `${pad}No items`;
    return resolved
      .map((item, index) => entryToText(`Item ${index + 1}`, item, depth))
      .join("\n");
  }
  if (isAnalysisBranch(resolved)) {
    const entries = Object.entries(resolved);
    if (entries.length === 0) return `${pad}No details`;
    return entries.map(([key, child]) => entryToText(key, child, depth)).join("\n");
  }
  return `${pad}${formatPrimitiveValue(resolved)}`;
}
