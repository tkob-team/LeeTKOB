import type { JudgeCode, ReviewQueueRow, Verdict } from '../../components/ui';

/** Response of GET /labs/{labId}/review-queue (docs/contract/get-review-queue.md). */
export interface ReviewQueuePage {
  labId: string;
  provisional: boolean;
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  items: ReviewItem[];
}

export type UnsureCause = 'model' | 'schema' | 'timeout' | 'evidence' | 'cost_cap';

export interface ReviewItem {
  submissionId: string;
  student: { id: string; displayName: string | null };
  submittedAt: string;
  judgeStatus: 'queued' | 'grading' | 'completed';
  verdict: JudgeCode | null;
  reviewStatus: 'reviewing' | 'checked' | 'not_checked';
  needsReview: boolean;
  constraints: ConstraintFinding[];
}

export interface ConstraintFinding {
  code: string;
  text: string;
  deduction: number;
  verdict: Verdict | null;
  source: 'hard_rule' | 'model' | 'guardrail' | null;
  evidence: { line: number; text: string }[];
  reason: string | null;
  unsureCause: UnsureCause | null;
  needsReview: boolean;
}

/** Table row plus the data the side panel needs. */
export interface QueueRow extends ReviewQueueRow {
  item: ReviewItem;
  finding: ConstraintFinding & { verdict: Verdict };
}

export const UNSURE_CAUSE: Record<UnsureCause, string> = {
  model: 'Mô hình trả lời unsure',
  schema: 'Phản hồi sai schema',
  timeout: 'Hết thời gian chờ mô hình',
  evidence: 'Bằng chứng không khớp mã nguồn',
  cost_cap: 'Chạm hạn mức chi phí',
};

const SOURCE: Record<NonNullable<ConstraintFinding['source']>, ReviewQueueRow['source']> = {
  hard_rule: 'hard rule',
  model: 'model',
  guardrail: 'guardrail',
};

/** Short pseudonymous label; the queue never shows student names (design system). */
export function submissionLabel(submissionId: string): string {
  return submissionId.slice(0, 8);
}

/** One row per (checked submission, constraint); the API already puts needsReview items first. */
export function toRows(items: ReviewItem[]): QueueRow[] {
  const rows: QueueRow[] = [];
  for (const item of items) {
    if (item.reviewStatus !== 'checked') continue;
    for (const finding of item.constraints) {
      const { verdict, source } = finding;
      if (verdict === null || source === null) continue;
      rows.push({
        id: `${item.submissionId}:${finding.code}`,
        submissionId: submissionLabel(item.submissionId),
        constraint: `${finding.code} ${finding.text}`,
        deduction: finding.deduction,
        source: SOURCE[source],
        verdict,
        evidenceLines: finding.evidence.map((line) => line.line),
        unsureCause: finding.unsureCause ? UNSURE_CAUSE[finding.unsureCause] : undefined,
        item,
        finding: { ...finding, verdict },
      });
    }
  }
  return rows;
}
