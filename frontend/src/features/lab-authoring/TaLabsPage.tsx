import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { EmptyState } from '../../app/EmptyState';
import { ProblemAlert } from '../../components/ui';
import { formatDateTime, labTitle, type Classroom, type LabSummary } from './lab-api';

interface ClassLabs {
  classroom: Classroom;
  labs: LabSummary[];
}

/** Every lab of the TA's classes; each row opens that lab's review queue. */
export function TaLabsPage() {
  const location = useLocation();
  const created = (location.state as { created?: string } | null)?.created;
  const [classes, setClasses] = useState<ClassLabs[]>();
  const [problem, setProblem] = useState<ProblemDetails>();

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      const list = await api.request<Classroom[]>('/classes', { signal: abort.signal });
      return Promise.all(
        list.map(async (classroom) => ({
          classroom,
          labs: await api.request<LabSummary[]>(
            `/classes/${encodeURIComponent(classroom.id)}/labs`,
            { signal: abort.signal },
          ),
        })),
      );
    }
    load()
      .then((loaded) => {
        if (!abort.signal.aborted) setClasses(loaded);
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted) setProblem(problemFrom(cause));
      });
    return () => {
      abort.abort();
    };
  }, []);

  return (
    <section className="lk-section" aria-labelledby="labs-title">
      <header className="lk-section__head">
        <h1 id="labs-title" className="lk-page__title">
          Lab và hàng chờ duyệt
        </h1>
        <p className="lk-page__note">Chọn một lab để mở hàng chờ duyệt của lab đó.</p>
      </header>
      {created ? (
        <p role="status" className="lk-page__note">
          Đã tạo lab {created}.
        </p>
      ) : null}
      {problem ? <ProblemAlert problem={problem} /> : null}
      {!classes && !problem ? <p className="lk-page__note">Đang tải danh sách lab…</p> : null}
      {classes?.length === 0 ? (
        <EmptyState title="Chưa có lớp">Bạn chưa được phân công trợ giảng lớp nào.</EmptyState>
      ) : null}
      {classes?.map(({ classroom, labs }) => (
        <section key={classroom.id} className="lk-panel" aria-label={classroom.name}>
          <div className="lk-row">
            <h2 className="lk-panel__title">{classroom.name}</h2>
            <Link
              className="lk-btn lk-btn--primary"
              to={`/ta/classes/${encodeURIComponent(classroom.id)}/labs/new`}
            >
              Tạo lab
            </Link>
          </div>
          {labs.length === 0 ? (
            <p className="lk-page__note">Lớp này chưa có lab.</p>
          ) : (
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
          )}
        </section>
      ))}
    </section>
  );
}
