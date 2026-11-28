import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { NotFoundPage } from '../../app/NotFoundPage';
import { Button, FormField, ProblemAlert } from '../../components/ui';
import type { Classroom } from '../lab-authoring/lab-api';
import { InviteCode, PeopleList } from './AdminClassesPage';
import { personName, taOptionLabel, type AdminMember, type TaAccount } from './admin-api';

/** An unknown class (404) or an id that is not a UUID (400) both mean "no such class". */
const NOT_FOUND_TYPES = new Set([
  'urn:leetkob:problem:class-not-found',
  'urn:leetkob:problem:invalid-request',
]);

/**
 * Picker of the TAs not yet in this class and "Gán". After an assignment the TA leaves the
 * picker and the focus returns to it; with nobody left to assign, a sentence replaces the form.
 */
function AssignTaForm({
  classId,
  candidates,
  hasAccounts,
  onAssigned,
}: {
  classId: string;
  candidates: TaAccount[];
  hasAccounts: boolean;
  onAssigned: (account: TaAccount) => Promise<void>;
}) {
  const [userId, setUserId] = useState('');
  const [problem, setProblem] = useState<ProblemDetails>();
  const [pending, setPending] = useState(false);
  /** Bumped after each assignment; the effect then puts the focus back on the picker. */
  const [assignedCount, setAssignedCount] = useState(0);
  const select = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (assignedCount > 0) select.current?.focus();
  }, [assignedCount]);

  if (!hasAccounts) return <p className="lk-page__note">Chưa có tài khoản trợ giảng.</p>;
  if (candidates.length === 0) {
    return <p className="lk-page__note">Mọi trợ giảng đã được gán cho lớp này.</p>;
  }

  async function assign() {
    const account = candidates.find((ta) => ta.id === userId);
    if (!account || pending) return;
    setPending(true);
    setProblem(undefined);
    try {
      await api.request<undefined>(`/classes/${encodeURIComponent(classId)}/tas`, {
        method: 'POST',
        body: JSON.stringify({ userId: account.id }),
      });
      setUserId('');
      await onAssigned(account);
      setAssignedCount((n) => n + 1);
    } catch (cause) {
      setProblem(problemFrom(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="lk-section">
      {problem ? <ProblemAlert problem={problem} /> : null}
      <div className="lk-assign">
        <FormField label="Trợ giảng">
          <select
            ref={select}
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
            }}
          >
            <option value="">Chọn trợ giảng…</option>
            {candidates.map((ta) => (
              <option key={ta.id} value={ta.id}>
                {taOptionLabel(ta)}
              </option>
            ))}
          </select>
        </FormField>
        <Button variant="primary" onClick={() => void assign()} disabled={pending || userId === ''}>
          Gán
        </Button>
      </div>
    </div>
  );
}

/** One class for the admin: invite code, TAs (and assigning one), students with name and email. */
export function AdminClassPage() {
  const { classId = '' } = useParams();
  const [classroom, setClassroom] = useState<Classroom>();
  const [members, setMembers] = useState<AdminMember[]>();
  const [tas, setTas] = useState<TaAccount[]>([]);
  const [problem, setProblem] = useState<ProblemDetails>();
  const [assigned, setAssigned] = useState('');

  const membersPath = `/admin/classes/${encodeURIComponent(classId)}/members`;

  useEffect(() => {
    const abort = new AbortController();
    const signal = abort.signal;
    Promise.all([
      api.request<Classroom>(`/classes/${encodeURIComponent(classId)}`, { signal }),
      api.request<AdminMember[]>(membersPath, { signal }),
      api.request<TaAccount[]>('/admin/tas', { signal }),
    ])
      .then(([found, list, accounts]) => {
        if (signal.aborted) return;
        setClassroom(found);
        setMembers(list);
        setTas(accounts);
      })
      .catch((cause: unknown) => {
        if (!signal.aborted) setProblem(problemFrom(cause));
      });
    return () => {
      abort.abort();
    };
  }, [classId, membersPath]);

  const onAssigned = useCallback(
    async (account: TaAccount) => {
      setAssigned(`Đã gán ${personName(account)}.`);
      try {
        setMembers(await api.request<AdminMember[]>(membersPath));
      } catch (cause) {
        setProblem(problemFrom(cause));
      }
    },
    [membersPath],
  );

  if (!classroom && problem && NOT_FOUND_TYPES.has(problem.type)) return <NotFoundPage />;

  const back = (
    <Link to="/admin/classes" className="lk-back">
      ← Lớp học
    </Link>
  );
  if (!classroom || !members) {
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

  const classTas = members.filter((m) => m.role === 'TA');
  const students = members.filter((m) => m.role === 'STUDENT');
  const taIds = new Set(classTas.map((m) => m.id));

  return (
    <section className="lk-section" aria-labelledby="admin-class-title">
      <header className="lk-section__head">
        {back}
        <h1 id="admin-class-title" className="lk-page__title">
          {classroom.name}
        </h1>
        {classroom.inviteCode ? (
          <p className="lk-page__note">
            Mã mời: <InviteCode code={classroom.inviteCode} classLabel={classroom.name} />
          </p>
        ) : (
          <p className="lk-page__note">Lớp này chưa có mã mời.</p>
        )}
      </header>
      {problem ? <ProblemAlert problem={problem} /> : null}

      <section className="lk-panel" aria-labelledby="class-tas-title">
        <h2 id="class-tas-title" className="lk-panel__title">
          Trợ giảng ({classTas.length})
        </h2>
        {classTas.length === 0 ? (
          <p className="lk-page__note">Lớp này chưa có trợ giảng.</p>
        ) : (
          <PeopleList people={classTas} />
        )}
        <p role="status" className="lk-page__note">
          {assigned}
        </p>
        <AssignTaForm
          classId={classroom.id}
          candidates={tas.filter((ta) => !taIds.has(ta.id))}
          hasAccounts={tas.length > 0}
          onAssigned={onAssigned}
        />
      </section>

      <section className="lk-panel" aria-labelledby="class-students-title">
        <h2 id="class-students-title" className="lk-panel__title">
          Sinh viên ({students.length})
        </h2>
        {students.length === 0 ? (
          <p className="lk-page__note">Chưa có sinh viên. Gửi mã mời để sinh viên tự vào lớp.</p>
        ) : (
          <div className="lk-table-wrap" role="region" aria-label="Sinh viên" tabIndex={0}>
            <table className="lk-table">
              <thead>
                <tr>
                  <th scope="col">Tên</th>
                  <th scope="col">Email</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td className="lk-wrap">{personName(student)}</td>
                    <td className="lk-wrap">{student.email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
