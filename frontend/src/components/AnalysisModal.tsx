import { useEffect, useRef, useState } from "react";
import { AnalysisContent } from "./AnalysisContent";
import { analysisToText } from "./analysisFormatting";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back for browsers or contexts that deny Clipboard API access.
    }
  }

  const textarea = document.createElement("textarea");
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(textarea);

  let copied: boolean;
  try {
    textarea.select();
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
    previousFocus?.focus();
  }

  if (!copied) throw new Error("Clipboard copy command was unsuccessful");
}

function printAnalysis(title: string, value: unknown) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font: 16px/1.6 Georgia, serif; padding: 32px; color: #191919; }
  h1 { font-size: 22px; margin: 0 0 18px; }
  .body { white-space: pre-wrap; }
  @media print { body { padding: 0; } }
</style></head>
<body><h1>${escapeHtml(title)}</h1><div class="body">${escapeHtml(analysisToText(value))}</div></body></html>`;

  iframe.onload = () => {
    const printWindow = iframe.contentWindow;
    if (!printWindow) {
      iframe.remove();
      return;
    }
    printWindow.onafterprint = () => iframe.remove();
    printWindow.focus();
    printWindow.print();
  };
  document.body.appendChild(iframe);
}

export function AnalysisModal({
  title,
  value,
  score,
  onClose,
}: {
  title: string;
  value: unknown;
  score?: number;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const copyTimerRef = useRef<number | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
      window.removeEventListener("keydown", handleKeyDown);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await copyText(analysisToText(value));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div
      className="analysis-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="analysis-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-modal-title"
      >
        <header className="analysis-modal-header">
          <div className="analysis-modal-heading">
            <h2 id="analysis-modal-title">{title}</h2>
            {typeof score === "number" && (
              <span className="analysis-modal-score">
                {score}<small>/100</small>
              </span>
            )}
          </div>
          <button
            ref={closeButtonRef}
            className="analysis-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close analysis"
          >
            ×
          </button>
        </header>

        <div className="analysis-modal-actions">
          <button type="button" onClick={() => void handleCopy()}>
            {copyState === "copied"
              ? "Copied"
              : copyState === "error"
                ? "Copy failed"
                : "Copy"}
          </button>
          <button type="button" onClick={() => printAnalysis(title, value)}>
            Download PDF
          </button>
          <span className="analysis-modal-copy-status" aria-live="polite">
            {copyState === "copied"
              ? "Analysis copied."
              : copyState === "error"
                ? "Could not copy the analysis."
                : ""}
          </span>
        </div>

        <div className="analysis-modal-body analysis-content">
          <AnalysisContent value={value} hideTitle />
        </div>
      </section>
    </div>
  );
}
