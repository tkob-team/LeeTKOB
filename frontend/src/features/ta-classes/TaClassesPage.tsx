import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { EmptyState } from '../../app/EmptyState';
import { CopyButton, ProblemAlert } from '../../components/ui';
import type { Classroom, LabSummary } from '../lab-authoring/lab-api';
import { countRole, taClassPath, type RosterEntry } from './ta-classes-api';

interface ClassSummary {
  classroom: Classroom;
  students: number;
  labs: number;
}

/** "Lớp của tôi": the TA's classes with student and lab counts, the invite code and a link. */
export function TaClassesPage() {
  const [classes, setClasses] = useState<ClassSummary[]>();
  const [problem, setProblem] = useState<ProblemDetails>();

  useEffect(() => {
    const abort = new AbortController();
    const signal = abort.signal;
    async function load() {
      const list = await api.request<Classroom[]>('/classes', { signal });
      return Promise.all(
        list.map(async (classroom) => {
          const base = `/classes/${encodeURIComponent(classroom.id)}`;
          const [roster, labs] = await Promise.all([
            api.request<RosterEntry[]>(`${base}/members`, { signal }),
            api.request<LabSummary[]>(`${base}/labs`, { signal }),
          ]);
          return { classroom, students: countRole(roster, 'STUDENT'), labs: labs.length };
        }),
      );
    }
    load()
      .then((loaded) => {
        if (!signal.aborted) setClasses(loaded);
      })
      .catch((cause: unknown) => {
        if (!signal.aborted) setProblem(problemFrom(cause));
      });
    return () => {
      abort.abort();
    };
  }, []);

  return (
    <section className="lk-section" aria-labelledby="ta-classes-title">
      <header className="lk-section__head">
        <h1 id="ta-classes-title" className="lk-page__title">
          Lớp của tôi
        </h1>
        <p className="lk-page__note">Mở một lớp để tạo lab và vào hàng chờ duyệt.</p>
      </header>
      {problem ? <ProblemAlert problem={problem} /> : null}
      {!classes && !problem ? <p className="lk-page__note">Đang tải danh sách lớp…</p> : null}
      {classes?.length === 0 ? (
        <EmptyState title="Chưa có lớp">Bạn chưa được phân công trợ giảng lớp nào.</EmptyState>
      ) : null}
      {classes?.length ? (
        <div className="lk-table-wrap" role="region" aria-label="Danh sách lớp" tabIndex={0}>
          <table className="lk-table">
            <thead>
              <tr>
                <th scope="col">Lớp</th>
                <th scope="col">Sinh viên</th>
                <th scope="col">Lab</th>
                <th scope="col">Mã mời</th>
              </tr>
            </thead>
            <tbody>
              {classes.map(({ classroom, students, labs }) => {
                const code = classroom.inviteCode;
                return (
                  <tr key={classroom.id}>
                    <td className="lk-wrap">
                      <Link to={taClassPath(classroom.id)}>{classroom.name}</Link>
                    </td>
                    <td>{students}</td>
                    <td>{labs}</td>
                    <td>
                      {code ? (
                        <span className="lk-invite">
                          <code className="lk-mono">{code}</code>
                          <CopyButton
                            getText={() => code}
                            ariaLabel={`Sao chép mã mời lớp ${classroom.name}`}
                          />
                        </span>
                      ) : (
                        'Chưa có mã mời'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
