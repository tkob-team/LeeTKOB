import { deductionLabel, evidenceLabel, MarkdownInline, VerdictBadge } from '../../components/ui';
import { SOURCE_LABEL, type QueueRow } from './review-queue';

export interface FindingsTableProps {
  rows: QueueRow[];
  selectedId?: string;
  /** Opens the row's evidence in the side panel. */
  onSelect: (row: QueueRow) => void;
  /** Accessible name of the table. */
  label: string;
}

/**
 * The constraints of one submission, as the design-system ReviewQueueTable lays them out
 * (same classes, columns and keyboard selection), with the source in Vietnamese ("Luật cứng",
 * "Mô hình", "Chặn an toàn") and its meaning as a `title`. Kept here, not in components/ui,
 * while that folder is being reworked; see AI-LOG. No bulk action: model `violation` rows are
 * reviewed one by one.
 */
export function FindingsTable({ rows, selectedId, onSelect, label }: FindingsTableProps) {
  return (
    <div className="lk-table-wrap">
      <table className="lk-table" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Ràng buộc</th>
            <th scope="col">Khoản trừ</th>
            <th scope="col">Nguồn</th>
            <th scope="col">Kết luận</th>
            <th scope="col">Bằng chứng</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const source = SOURCE_LABEL[row.source];
            const select = () => {
              onSelect(row);
            };
            return (
              <tr
                key={row.id}
                aria-selected={row.id === selectedId}
                tabIndex={0}
                onClick={select}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    select();
                  }
                }}
              >
                <td className="lk-wrap">
                  <MarkdownInline>{row.constraint}</MarkdownInline>
                </td>
                <td>{deductionLabel(row.verdict, row.deduction)}</td>
                <td>
                  <span title={source.title}>{source.label}</span>
                </td>
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
