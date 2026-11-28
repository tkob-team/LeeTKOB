import { Link } from 'react-router';
import { formatDateTime, labTitle, type LabSummary } from './lab-api';

/**
 * The labs of one class in the order GET /classes/{classId}/labs sends them (latest opening
 * first); each row opens that lab's review queue.
 */
export function LabTable({ labs }: { labs: LabSummary[] }) {
  if (labs.length === 0) return <p className="lk-page__note">Lớp này chưa có lab.</p>;
  return (
    <div className="lk-table-wrap">
      <table className="lk-table">
        <thead>
          <tr>
            <th scope="col">Lab</th>
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
          {labs.map((lab) => (
            <tr key={lab.id}>
              <td className="lk-wrap">{labTitle(lab.title)}</td>
              <td>{formatDateTime(lab.opensAt)}</td>
              <td>{formatDateTime(lab.dueAt)}</td>
              <td>{lab.testCount}</td>
              <td>{lab.constraintCount}</td>
              <td>
                {lab.submissionCount} bài · {lab.studentsSubmitted} sinh viên
              </td>
              <td className="lk-wrap">
                <Link
                  className="lk-btn lk-btn--secondary"
                  to={`/ta/labs/${encodeURIComponent(lab.id)}/review`}
                >
                  Hàng chờ duyệt: {labTitle(lab.title)}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
