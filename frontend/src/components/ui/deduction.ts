import type { Verdict } from './VerdictBadge';

/**
 * A deduction is only taken for `violation` or `unsure`; for `pass` it reads
 * "0 (−N nếu vi phạm)", so the constraint's deduction does not look like marks taken.
 */
export function deductionLabel(verdict: Verdict, value: number): string {
  const minus = value === 0 ? '0' : `−${String(value)}`;
  if (verdict === 'pass') return `0 (${minus} nếu vi phạm)`;
  return minus;
}

/** Evidence line numbers as words: "dòng 11", "dòng 9, 10"; a dash when there are none. */
export function evidenceLabel(lines: number[]): string {
  return lines.length > 0 ? `dòng ${lines.join(', ')}` : '—';
}
