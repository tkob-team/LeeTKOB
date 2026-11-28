import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { CLASS_NOT_FOUND } from '../../app/not-found-text';
import { NotFoundPage } from '../../app/NotFoundPage';
import { usePageTitle } from '../../app/usePageTitle';
import { ProblemAlert } from '../../components/ui';
import { CreateLabPage } from './CreateLabPage';
import type { Classroom } from './lab-api';

/** An unknown class, a class the TA does not teach (404) or a non-UUID id (400). */
const NOT_FOUND_TYPES = new Set([
  'urn:leetkob:problem:class-not-found',
  'urn:leetkob:problem:invalid-request',
]);

/**
 * "Tạo lab" route: reads GET /classes/{classId} before showing the form, so a TA never fills in a
 * lab for a class that is not theirs and loses it on "Tạo lab".
 */
export function CreateLabRoute() {
  const { classId = '' } = useParams();
  const [classroom, setClassroom] = useState<Classroom>();
  const [problem, setProblem] = useState<ProblemDetails>();

  useEffect(() => {
    const abort = new AbortController();
    api
      .request<Classroom>(`/classes/${encodeURIComponent(classId)}`, { signal: abort.signal })
      .then((found) => {
        if (!abort.signal.aborted) setClassroom(found);
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted) setProblem(problemFrom(cause));
      });
    return () => {
      abort.abort();
    };
  }, [classId]);

  const notFound = problem !== undefined && NOT_FOUND_TYPES.has(problem.type);
  // Once the form or the 404 page shows, that page names the tab.
  usePageTitle(classroom || notFound ? undefined : 'Tạo lab');

  if (notFound) return <NotFoundPage {...CLASS_NOT_FOUND} />;
  if (classroom) return <CreateLabPage classroom={classroom} />;
  return (
    <section className="lk-section">
      <Link to="/ta/classes" className="lk-back">
        ← Lớp của tôi
      </Link>
      {problem ? (
        <ProblemAlert problem={problem} />
      ) : (
        <p className="lk-page__note">Đang tải lớp…</p>
      )}
    </section>
  );
}
