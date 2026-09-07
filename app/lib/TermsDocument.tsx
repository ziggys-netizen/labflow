import { formatTermsDocument } from "./legal/acceptableUse";

/** One source: `ACCEPTABLE_USE` via `formatTermsDocument`. Never a second copy. */
export default function TermsDocument({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        overflowY: "auto",
        maxHeight: "min(28rem, 55vh)",
        border: "1px solid var(--lf-line)",
        borderRadius: "var(--lf-r-sm)",
        padding: "16px",
        background: "var(--lf-surface)",
      }}
    >
      <pre className="m-0 whitespace-pre-wrap font-sans text-sm leading-relaxed text-lf-ink">
        {formatTermsDocument()}
      </pre>
    </div>
  );
}
