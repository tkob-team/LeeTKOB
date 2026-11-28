import { useState } from 'react';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import { ConfirmDialog } from '../../components/ui';
import {
  HAS_SUBMISSIONS,
  personName,
  removalPath,
  runLimited,
  type AdminMember,
} from './admin-api';

/** At most this many DELETE requests run at once. */
export const BULK_PARALLEL = 4;
/** The confirmation names this many students, then "và N khác". */
const NAMED = 5;

export type BulkOutcome =
  { kind: 'removed' } | { kind: 'submitted' } | { kind: 'error'; text: string };

export interface BulkResult {
  member: AdminMember;
  outcome: BulkOutcome;
}

function outcomeText(outcome: BulkOutcome) {
  if (outcome.kind === 'removed') return 'Đã gỡ';
  if (outcome.kind === 'submitted') return 'Đã có bài nộp, chưa gỡ';
  return `Lỗi: ${outcome.text}`;
}

/**
 * Removing several students (B1): a ConfirmDialog naming up to five of them, then "Đang gỡ i/N…"
 * while at most four DELETE requests run, then the result of each student and "Đóng".
 */
export function BulkRemoveDialog({
  targets,
  className,
  classId,
  onFinished,
  onClose,
}: {
  targets: AdminMember[];
  className: string;
  classId: string;
  /** Called once every request has settled, before the results are shown. */
  onFinished: (results: BulkResult[]) => Promise<void>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<'confirm' | 'running' | 'done'>('confirm');
  const [settled, setSettled] = useState(0);
  const [results, setResults] = useState<BulkResult[]>([]);
  const total = targets.length;

  async function run() {
    if (phase !== 'confirm') return;
    setPhase('running');
    const outcomes = await runLimited(
      targets,
      BULK_PARALLEL,
      async (member): Promise<BulkResult> => {
        try {
          await api.request<undefined>(removalPath(classId, member), { method: 'DELETE' });
          return { member, outcome: { kind: 'removed' } };
        } catch (cause) {
          const problem = problemFrom(cause);
          return {
            member,
            outcome:
              problem.type === HAS_SUBMISSIONS
                ? { kind: 'submitted' }
                : { kind: 'error', text: problem.title },
          };
        }
      },
      setSettled,
    );
    await onFinished(outcomes);
    setResults(outcomes);
    setPhase('done');
  }

  if (phase === 'done') {
    const removed = results.filter((r) => r.outcome.kind === 'removed').length;
    return (
      <ConfirmDialog
        open
        title={`Đã gỡ ${String(removed)}/${String(total)} sinh viên khỏi ${className}`}
        body={
          <div className="lk-table-wrap" role="region" aria-label="Kết quả" tabIndex={0}>
            <table className="lk-table">
              <thead>
                <tr>
                  <th scope="col">Sinh viên</th>
                  <th scope="col">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {results.map(({ member, outcome }) => (
                  <tr key={member.id}>
                    <td className="lk-wrap">{personName(member)}</td>
                    <td className="lk-wrap">{outcomeText(outcome)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
        cancelLabel="Đóng"
        onConfirm={onClose}
        onCancel={onClose}
      />
    );
  }

  const named = targets.slice(0, NAMED).map(personName);
  const others = total - named.length;
  return (
    <ConfirmDialog
      open
      title={`Gỡ ${String(total)} sinh viên khỏi ${className}?`}
      body={
        <>
          <ul className="lk-dialog__list">
            {named.map((name, index) => (
              <li key={targets[index]?.id ?? name}>{name}</li>
            ))}
            {others > 0 ? <li>và {others} khác</li> : null}
          </ul>
          <p>
            Các sinh viên này sẽ không còn thấy lab của lớp này. Chỉ gỡ được sinh viên chưa nộp bài
            nào trong lớp.
          </p>
        </>
      }
      confirmLabel={`Gỡ ${String(total)} sinh viên`}
      pendingLabel={`Đang gỡ ${String(settled)}/${String(total)}…`}
      pending={phase === 'running'}
      onConfirm={() => void run()}
      onCancel={onClose}
    />
  );
}
