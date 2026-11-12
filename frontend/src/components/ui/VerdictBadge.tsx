export type Verdict = 'pass' | 'violation' | 'unsure';

const GLYPH: Record<Verdict, string> = { pass: '✓', violation: '✕', unsure: '?' };

export interface VerdictBadgeProps {
  verdict: Verdict;
}

/** Word plus colour plus glyph; never colour alone. `unsure` belongs in TA views only. */
export function VerdictBadge({ verdict }: VerdictBadgeProps) {
  return (
    <span className={`lk-verdict lk-verdict--${verdict}`}>
      <span aria-hidden="true">{GLYPH[verdict]}</span> {verdict}
    </span>
  );
}
