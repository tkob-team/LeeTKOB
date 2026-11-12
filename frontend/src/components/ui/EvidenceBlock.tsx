export interface EvidenceBlockProps {
  /** Original submitted lines (not the comment-stripped copy). */
  lines: string[];
  /** 1-based line numbers of the evidence lines, in the numbering of the original file. */
  evidence: number[];
  /** Number of the first line in `lines`; defaults to 1. */
  firstLine?: number;
  /** Accessible name, e.g. "Bài nộp s05, dòng bằng chứng 8 và 12". */
  label: string;
}

/** Scrolls, never wraps code lines. Model reasoning goes beside the block, not inside it. */
export function EvidenceBlock({ lines, evidence, firstLine = 1, label }: EvidenceBlockProps) {
  const hits = new Set(evidence);
  return (
    <div className="lk-evidence" role="region" aria-label={label}>
      {lines.map((text, index) => {
        const number = firstLine + index;
        const hit = hits.has(number);
        return (
          <div
            key={number}
            className={hit ? 'lk-line lk-line--hit' : 'lk-line'}
            data-evidence={hit ? 'true' : undefined}
          >
            <span className="lk-ln">{number}</span>
            <span>{text}</span>
          </div>
        );
      })}
    </div>
  );
}
