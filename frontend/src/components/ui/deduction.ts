import type { Verdict } from './VerdictBadge';

/**
 * A deduction is only taken for `violation` or `unsure`; for `pass` the constraint's deduction is
 * shown as what a violation would cost, so it does not read as marks taken.
 */
export function deductionLabel(verdict: Verdict, value: number): string {
  if (verdict === 'pass') return `Không trừ (mức trừ nếu vi phạm: ${String(value)})`;
  return value === 0 ? '0' : `−${String(value)}`;
}
