import { useState } from 'react';
import { Link } from 'react-router';
import { formatDateTime, labTitle, type LabSummary } from './lab-api';
import { labPhase, labPhaseClass } from './lab-phase';

const reviewPath = (labId: string) => `/ta/labs/${encodeURIComponent(labId)}/review`;

/**
 * The labs of one class in the order GET /classes/{classId}/labs sends them (latest opening
 * first). The lab title and the short "Hàng chờ" button both open that lab's review queue; the
 * status column says whether the lab is upcoming, open (days left) or past its deadline. The
 * frame scrolls on its own (keyboard focusable) and never widens the page on a phone.
 */
export function LabTable({ labs }: { labs: LabSummary[] }) {
  const [now] = useState(() => Date.now());
  if (labs.length === 0) return <p className="lk-page__note">Lớp này chưa có lab.</p>;
  return (
    <div
      className="lk-table-wrap lk-table-frame"
      role="region"
      aria-label="Danh sách lab của lớp"
      tabIndex={0}
    >
      <table className="lk-table">
        <thead>
          <tr>
            <th scope="col">Lab</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Mở</th>
            <th scope="col">Hạn nộp</th>
            <th scope="col">Test</th>
            <th scope="col">Ràng buộc</th>
            <th scope="col">Bài nộp</th>
            <th scope="col">
              <span className="lk-sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {labs.map((lab) => {
            const title = labTitle(lab.title);
            const phase = labPhase(lab.opensAt, lab.dueAt, now);
            return (
              <tr key={lab.id}>
                <td className="lk-wrap">
                  <Link to={reviewPath(lab.id)}>{title}</Link>
                </td>
                <td>
                  <span className={labPhaseClass(phase.kind)}>{phase.label}</span>
                </td>
                <td>{formatDateTime(lab.opensAt)}</td>
                <td>{formatDateTime(lab.dueAt)}</td>
                <td>{lab.testCount}</td>
                <td>{lab.constraintCount}</td>
                <td>
                  {lab.submissionCount} bài · {lab.studentsSubmitted} sinh viên
                </td>
                <td>
                  <Link
                    className="lk-btn lk-btn--secondary"
                    to={reviewPath(lab.id)}
                    aria-label={`Hàng chờ duyệt: ${title}`}
                  >
                    Hàng chờ
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
