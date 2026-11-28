import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { NotFoundPage } from '../../app/NotFoundPage';
import { CopyButton, ProblemAlert } from '../../components/ui';
import type { Classroom, LabSummary } from '../lab-authoring/lab-api';
import { LabTable } from '../lab-authoring/LabTable';
import { countRole, type RosterEntry } from './ta-classes-api';

/** An unknown class, a class the TA does not teach (404) or a non-UUID id (400). */
const NOT_FOUND_TYPES = new Set([
  'urn:leetkob:problem:class-not-found',
  'urn:leetkob:problem:invalid-request',
]);

interface Loaded {
  classroom: Classroom;
  roster: RosterEntry[];
  labs: LabSummary[];
}

/** One class for its TA: "Tạo lab", invite code, member counts and the labs with their queues. */
export function TaClassPage() {
  const { classId = '' } = useParams();
  const location = useLocation();
  const created = (location.state as { created?: string } | null)?.created;
  const [data, setData] = useState<Loaded>();
  const [problem, setProblem] = useState<ProblemDetails>();

  useEffect(() => {
    const abort = new AbortController();
    const signal = abort.signal;
    const base = `/classes/${encodeURIComponent(classId)}`;
    Promise.all([
      api.request<Classroom>(base, { signal }),
      api.request<RosterEntry[]>(`${base}/members`, { signal }),
      api.request<LabSummary[]>(`${base}/labs`, { signal }),
    ])
      .then(([classroom, roster, labs]) => {
        if (!signal.aborted) setData({ classroom, roster, labs });
      })
      .catch((cause: unknown) => {
        if (!signal.aborted) setProblem(problemFrom(cause));
      });
    return () => {
      abort.abort();
    };
  }, [classId]);

  if (problem && NOT_FOUND_TYPES.has(problem.type)) return <NotFoundPage />;

  const back = (
    <Link to="/ta/classes" className="lk-back">
      ← Lớp của tôi
    </Link>
  );
  if (!data) {
    return (
      <section className="lk-section">
        {back}
        {problem ? (
          <ProblemAlert problem={problem} />
        ) : (
          <p className="lk-page__note">Đang tải lớp…</p>
        )}
      </section>
    );
  }

  const { classroom, roster, labs } = data;
  const code = classroom.inviteCode;
  return (
    <section className="lk-section" aria-labelledby="ta-class-title">
      <header className="lk-section__head">
        {back}
        <div className="lk-title-row">
          <h1 id="ta-class-title" className="lk-page__title">
            {classroom.name}
          </h1>
          <Link
            className="lk-btn lk-btn--primary"
            to={`/ta/classes/${encodeURIComponent(classroom.id)}/labs/new`}
          >
            Tạo lab
          </Link>
        </div>
        {code ? (
          <div className="lk-invite">
            <span>
              Mã mời: <code className="lk-mono">{code}</code>
            </span>
            <CopyButton getText={() => code} label="Sao chép mã mời" />
          </div>
        ) : (
          <p className="lk-page__note">Lớp này chưa có mã mời.</p>
        )}
        <p className="lk-page__note">
          {countRole(roster, 'TA')} trợ giảng · {countRole(roster, 'STUDENT')} sinh viên
        </p>
      </header>
      {created !== undefined ? (
        <p role="status" className="lk-page__note">
          Đã tạo lab {created}.
        </p>
      ) : null}
      <section className="lk-panel" aria-labelledby="ta-class-labs-title">
        <h2 id="ta-class-labs-title" className="lk-panel__title">
          Lab và hàng chờ duyệt
        </h2>
        <LabTable labs={labs} />
      </section>
    </section>
  );
}
