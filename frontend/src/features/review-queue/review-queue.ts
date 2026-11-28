import type { JudgeCode, Verdict } from '../../components/ui';

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
  /**
   * False for an earlier AC submission returned with includeEarlier=true (contract 1.1.0).
   * Absent from a 1.0.0 response; treated as counted.
   */
  counted?: boolean;
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

export type FindingSource = NonNullable<ConstraintFinding['source']>;

/** One table row (submission × constraint) plus the data the side panel needs. */
export interface QueueRow {
  id: string;
  /** Short pseudonymous submission label (submissionLabel). */
  submissionId: string;
  constraint: string;
  /** Marks deducted, as a positive number; shown with a minus sign. */
  deduction: number;
  /** API value; the table shows SOURCE_LABEL. */
  source: FindingSource;
  verdict: Verdict;
  evidenceLines: number[];
  /** Why the verdict is `unsure` (TA views only). */
  unsureCause?: string;
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

/**
 * Vietnamese name of each finding source (the design system keeps only pass/violation/unsure
 * and judge codes in English) and the sentence shown as its `title`. API values are unchanged.
 */
export const SOURCE_LABEL: Record<FindingSource, { label: string; title: string }> = {
  hard_rule: {
    label: 'Luật cứng',
    title: 'Luật cố định của trình soát (hard_rule), không dùng mô hình.',
  },
  model: {
    label: 'Mô hình',
    title: 'Kết luận của mô hình ngôn ngữ (model); trợ giảng duyệt từng dòng.',
  },
  guardrail: {
    label: 'Chặn an toàn',
    title:
      'Một giới hạn (hết thời gian, sai schema, bằng chứng không khớp, hạn mức chi phí) đã quyết định kết luận (guardrail).',
  },
};

/**
 * Stable anonymous student label ("Sinh viên 3F2A"): 4 hex digits of an FNV-1a hash of the student
 * id. The queue never shows real names (design system); the hash keeps seeded ids that share a
 * prefix apart.
 */
export function studentLabel(studentId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < studentId.length; i += 1) {
    hash ^= studentId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0').slice(0, 4).toUpperCase();
  return `Sinh viên ${hex}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date and time with seconds: submissions can arrive within the same minute. */
export function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Short pseudonymous label; the queue never shows student names (design system). */
export function submissionLabel(submissionId: string): string {
  return submissionId.slice(0, 8);
}

export function isCounted(item: ReviewItem): boolean {
  return item.counted !== false;
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
        source,
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

/**
 * Reasons written by the checker's hard rules (checker/src/checker/hard_rules.py), in the exact
 * form it produces, and their Vietnamese text. Only hard-rule reasons are rewritten; a model's
 * reason is shown as the model wrote it.
 */
const HARD_RULE_REASON: { pattern: RegExp; text: (match: RegExpExecArray) => string }[] = [
  {
    // "uses banned `std::sort`" or "uses banned `qsort`, `std::sort`"
    pattern: /^uses banned ((?:`[^`]+`)(?:, `[^`]+`)*)$/,
    text: (match) => `Dùng hàm bị cấm ${match[1] ?? ''}.`,
  },
  { pattern: /^no banned name is used$/, text: () => 'Không dùng hàm bị cấm.' },
  {
    pattern: /^the source could not be parsed$/,
    text: () => 'Không phân tích được mã nguồn, cần trợ giảng xem.',
  },
];

/** The reason to show in the panel: Vietnamese for a hard rule, as sent otherwise. */
export function reasonText(finding: Pick<ConstraintFinding, 'source' | 'reason'>): string | null {
  const { reason } = finding;
  if (reason === null || finding.source !== 'hard_rule') return reason;
  for (const rule of HARD_RULE_REASON) {
    const match = rule.pattern.exec(reason);
    if (match) return rule.text(match);
  }
  return reason;
}
