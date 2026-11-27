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

export interface ReviewQueueTableProps {
  rows: ReviewQueueRow[];
  selectedId?: string;
  /** Opens the row's EvidenceBlock beside the table. */
  onSelect?: (row: ReviewQueueRow) => void;
  /** False when the table sits under a block header that already names the submission. */
  showSubmission?: boolean;
  /** Accessible name of the table. */
  label?: string;
}

/**
 * The constraint text wraps (never clipped) and renders inline code; the other columns keep
 * their width so Khoản trừ, Nguồn and Kết luận stay in view.
 * No bulk action here: model `violation` rows are reviewed one by one. */
export function ReviewQueueTable({
  rows,
  selectedId,
  onSelect,
  showSubmission = true,
  label,
}: ReviewQueueTableProps) {
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
                <td>{row.source}</td>
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
