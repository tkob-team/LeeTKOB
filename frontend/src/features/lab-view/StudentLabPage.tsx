import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiProblemError } from '../../api/client';
import type { ProblemDetails } from '../../api/problem';
import { EmptyState } from '../../app/EmptyState';
import { Markdown, MarkdownInline, ProblemAlert } from '../../components/ui';
import {
  formatDateTime,
  formatDeduction,
  labTitle,
  type LabDetail,
} from '../lab-authoring/lab-api';

interface StudentLab {
  id: string;
  title: string | null;
}

function requestProblem(cause: unknown): ProblemDetails {
  if (cause instanceof ApiProblemError) {
    if (cause.problem.type === 'urn:leetkob:problem:lab-not-open') {
      return { ...cause.problem, title: 'Lab chưa mở', detail: 'Đề bài hiện khi lab mở.' };
    }
    return cause.problem;
  }
  return { type: 'about:blank', title: 'Không đọc được phản hồi của máy chủ', status: 0 };
}

/** The labs of the student's classes, each linking to its statement. */
export function StudentLabsPage() {
  const [labs, setLabs] = useState<StudentLab[]>();
  const [problem, setProblem] = useState<ProblemDetails>();

  useEffect(() => {
    const abort = new AbortController();
    api
      .request<StudentLab[]>('/student/labs', { signal: abort.signal })
      .then((list) => {
        if (!abort.signal.aborted) setLabs(list);
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted) setProblem(requestProblem(cause));
      });
    return () => {
      abort.abort();
    };
  }, []);

  if (labs?.length === 0) {
    return <EmptyState title="Đề bài">Lớp của bạn chưa có lab nào.</EmptyState>;
  }
  return (
    <section className="lk-section" aria-labelledby="student-labs-title">
      <h1 id="student-labs-title" className="lk-page__title">
        Đề bài
      </h1>
      {problem ? <ProblemAlert problem={problem} /> : null}
      {!labs && !problem ? <p className="lk-page__note">Đang tải danh sách lab…</p> : null}
      <ul className="lk-list">
        {labs?.map((lab) => (
          <li key={lab.id}>
            <Link to={`/student/labs/${encodeURIComponent(lab.id)}`}>{labTitle(lab.title)}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Statement, limits and constraints with their deductions (FAQ-06); never the tests. */
export function StudentLabPage() {
  const { labId = '' } = useParams();
  const [lab, setLab] = useState<LabDetail>();
  const [problem, setProblem] = useState<ProblemDetails>();

  useEffect(() => {
    const abort = new AbortController();
    api
      .request<LabDetail>(`/labs/${encodeURIComponent(labId)}`, { signal: abort.signal })
      .then((detail) => {
        if (!abort.signal.aborted) setLab(detail);
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted) setProblem(requestProblem(cause));
      });
    return () => {
      abort.abort();
    };
  }, [labId]);

  if (problem) {
    return (
      <section className="lk-section">
        <ProblemAlert problem={problem} />
        <Link to="/student/labs">Về danh sách đề bài</Link>
      </section>
    );
  }
  if (!lab) return <p className="lk-page__note">Đang tải đề bài…</p>;

  return (
    <article className="lk-section" aria-labelledby="lab-title">
      <header className="lk-section__head">
        <h1 id="lab-title" className="lk-page__title">
          {labTitle(lab.title)}
        </h1>
        <p className="lk-page__note">
          Mở {formatDateTime(lab.opensAt)} · Hạn nộp {formatDateTime(lab.dueAt)}
        </p>
        <p className="lk-page__note">
          Giới hạn: CPU {lab.cpuTimeMs} ms · thời gian thực {lab.wallTimeMs} ms · bộ nhớ{' '}
          {lab.memoryMb} MB
        </p>
      </header>

      <section className="lk-panel" aria-label="Đề bài">
        <Markdown>{lab.statementMd}</Markdown>
      </section>

      <section className="lk-panel" aria-labelledby="lab-constraints-title">
        <h2 id="lab-constraints-title" className="lk-panel__title">
          Ràng buộc và khoản trừ
        </h2>
        {lab.constraints.length === 0 ? (
          <p>Lab này không có ràng buộc.</p>
        ) : (
          <div className="lk-table-wrap">
            <table className="lk-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Chi tiết ràng buộc</th>
                  <th scope="col">Khoản trừ</th>
                </tr>
              </thead>
              <tbody>
                {lab.constraints.map((constraint) => (
                  <tr key={constraint.code}>
                    <td className="lk-mono">{constraint.code}</td>
                    <td className="lk-wrap">
                      <MarkdownInline>{constraint.text}</MarkdownInline>
                    </td>
                    <td>{formatDeduction(constraint.deduction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>Khoản trừ chỉ áp dụng sau khi trợ giảng duyệt và công bố điểm.</p>
      </section>

      <div>
        <Link
          className="lk-btn lk-btn--primary"
          to={`/student/submit?lab=${encodeURIComponent(lab.id)}`}
        >
          Đi tới trang nộp bài
        </Link>
      </div>
    </article>
  );
}
