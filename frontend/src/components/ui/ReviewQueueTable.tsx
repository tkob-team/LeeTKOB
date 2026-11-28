import type { ReactNode } from 'react';
import { deductionLabel, evidenceLabel } from './deduction';
import { MarkdownInline } from './Markdown';
import { VerdictBadge, type Verdict } from './VerdictBadge';

export interface ReviewQueueRow {
  id: string;
  /** Pseudonymous id; student names are never shown in the queue. */
  submissionId: string;
  constraint: string;
  /** Marks deducted, as a positive number; shown with a minus sign. */
  deduction: number;
  /** `guardrail`: a limit (timeout, schema, evidence check, cost cap) produced the verdict. */
  source: 'hard rule' | 'model' | 'guardrail';
  verdict: Verdict;
  evidenceLines: number[];
  /** Why the verdict is `unsure`, shown under the badge (TA views only). */
  unsureCause?: string;
}

/** What the table reads from a row; a feature may pass its own row type with more fields. */
export type ReviewQueueTableRow = Omit<ReviewQueueRow, 'source'> & { source: string };

export interface ReviewQueueTableProps<Row extends ReviewQueueTableRow = ReviewQueueRow> {
  rows: Row[];
  selectedId?: string;
  /** Opens the row's EvidenceBlock beside the table. */
  onSelect?: (row: Row) => void;
  /** Renders the Nguồn cell (for example a translated label); defaults to `row.source`. */
  renderSource?: (row: Row) => ReactNode;
  /** False when the table sits under a block header that already names the submission. */
  showSubmission?: boolean;
  /** Accessible name of the table. */
  label?: string;
}

/**
 * The constraint text wraps (never clipped) and renders inline code; the other columns keep
 * their width so Khoản trừ, Nguồn and Kết luận stay in view.
 * No bulk action here: model `violation` rows are reviewed one by one. */
export function ReviewQueueTable<Row extends ReviewQueueTableRow = ReviewQueueRow>({
  rows,
  selectedId,
  onSelect,
  renderSource,
  showSubmission = true,
  label,
}: ReviewQueueTableProps<Row>) {
  return (
    <div className="lk-table-wrap">
      <table className="lk-table" aria-label={label}>
        <thead>
          <tr>
            {showSubmission ? <th scope="col">Bài nộp</th> : null}
            <th scope="col">Ràng buộc</th>
            <th scope="col">Khoản trừ</th>
            <th scope="col">Nguồn</th>
            <th scope="col">Kết luận</th>
            <th scope="col">Bằng chứng</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const select = onSelect
              ? () => {
                  onSelect(row);
                }
              : undefined;
            return (
              <tr
                key={row.id}
                aria-selected={select ? row.id === selectedId : undefined}
                tabIndex={select ? 0 : undefined}
                onClick={select}
                onKeyDown={
                  select
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          select();
                        }
                      }
                    : undefined
                }
              >
                {showSubmission ? <td className="lk-mono">{row.submissionId}</td> : null}
                <td className="lk-wrap">
                  <MarkdownInline>{row.constraint}</MarkdownInline>
                </td>
                <td>{deductionLabel(row.verdict, row.deduction)}</td>
                <td>{renderSource ? renderSource(row) : row.source}</td>
                <td>
                  <VerdictBadge verdict={row.verdict} />
                  {row.unsureCause ? <p className="lk-cause">{row.unsureCause}</p> : null}
                </td>
                <td>{evidenceLabel(row.evidenceLines)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
