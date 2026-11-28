import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { NotFoundPage } from '../../app/NotFoundPage';
import { Button, FormField, ProblemAlert } from '../../components/ui';
import type { Classroom } from '../lab-authoring/lab-api';
import { InviteCode, PersonName } from './AdminClassesPage';
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

const HAS_SUBMISSIONS = 'urn:leetkob:problem:member-has-submissions';

/** What removing a member ended with: the removed member, or a problem to show. */
type RemoveOutcome = { removed: AdminMember } | { problem: ProblemDetails };

/**
 * "Gỡ" for one member. A press shows, in place, "Xác nhận gỡ <tên>?" and "Huỷ" (never a
 * browser dialog); confirming sends DELETE and reports the outcome to the page.
 */
function RemoveMember({
  member,
  classId,
  onDone,
}: {
  member: AdminMember;
  classId: string;
  onDone: (outcome: RemoveOutcome) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  /** Bumped to move the focus after the next render: to the confirm button, or back to "Gỡ". */
  const [focusTarget, setFocusTarget] = useState<{ to: 'confirm' | 'remove' }>();
  const name = personName(member);
  const kind = member.role === 'TA' ? 'tas' : 'students';

  useEffect(() => {
    if (focusTarget?.to === 'confirm') confirmRef.current?.focus();
    if (focusTarget?.to === 'remove') removeRef.current?.focus();
  }, [focusTarget]);

  async function remove() {
    if (pending) return;
    setPending(true);
    let outcome: RemoveOutcome;
    try {
      await api.request<undefined>(
        `/admin/classes/${encodeURIComponent(classId)}/${kind}/${encodeURIComponent(member.id)}`,
        { method: 'DELETE' },
      );
      outcome = { removed: member };
    } catch (cause) {
      const problem = problemFrom(cause);
      outcome = {
        problem:
          problem.type === HAS_SUBMISSIONS
            ? {
                type: problem.type,
                status: problem.status,
                title: `${name} đã có bài nộp, chưa gỡ được.`,
              }
            : problem,
      };
      setPending(false);
      setConfirming(false);
      setFocusTarget({ to: 'remove' });
    }
    await onDone(outcome);
  }

  if (!confirming) {
    return (
      <Button
        ref={removeRef}
        aria-label={`Gỡ ${name}`}
        onClick={() => {
          setConfirming(true);
          setFocusTarget({ to: 'confirm' });
        }}
      >
        Gỡ
      </Button>
    );
  }
  return (
    <span className="lk-confirm">
      <Button ref={confirmRef} variant="danger" disabled={pending} onClick={() => void remove()}>
        {`Xác nhận gỡ ${name}?`}
      </Button>
      <Button
        disabled={pending}
        onClick={() => {
          setConfirming(false);
          setFocusTarget({ to: 'remove' });
        }}
      >
        Huỷ
      </Button>
    </span>
  );
}

/** One class for the admin: invite code, TAs (and assigning one), students with name and email. */
export function AdminClassPage() {
  const { classId = '' } = useParams();
  const [classroom, setClassroom] = useState<Classroom>();
  const [members, setMembers] = useState<AdminMember[]>();
  const [tas, setTas] = useState<TaAccount[]>([]);
  const [problem, setProblem] = useState<ProblemDetails>();
  const [taStatus, setTaStatus] = useState('');
  const [studentStatus, setStudentStatus] = useState('');
  const [taProblem, setTaProblem] = useState<ProblemDetails>();
  const [studentProblem, setStudentProblem] = useState<ProblemDetails>();
  const taHeading = useRef<HTMLHeadingElement>(null);
  const studentHeading = useRef<HTMLHeadingElement>(null);

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

  const reloadMembers = useCallback(async () => {
    try {
      setMembers(await api.request<AdminMember[]>(membersPath));
    } catch (cause) {
      setProblem(problemFrom(cause));
    }
  }, [membersPath]);

  const onAssigned = useCallback(
    async (account: TaAccount) => {
      setTaProblem(undefined);
      setTaStatus(`Đã gán ${personName(account)}.`);
      await reloadMembers();
    },
    [reloadMembers],
  );

  /** After a removal: the sentence, the reloaded list, and the focus on the section heading. */
  const onRemoveDone = useCallback(
    async (role: AdminMember['role'], outcome: RemoveOutcome) => {
      const setStatus = role === 'TA' ? setTaStatus : setStudentStatus;
      const setSectionProblem = role === 'TA' ? setTaProblem : setStudentProblem;
      if ('problem' in outcome) {
        setStatus('');
        setSectionProblem(outcome.problem);
        return;
      }
      setSectionProblem(undefined);
      setStatus(`Đã gỡ ${personName(outcome.removed)}.`);
      await reloadMembers();
      (role === 'TA' ? taHeading : studentHeading).current?.focus();
    },
    [reloadMembers],
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
        <h2 id="class-tas-title" className="lk-panel__title" ref={taHeading} tabIndex={-1}>
          Trợ giảng ({classTas.length})
        </h2>
        {classTas.length === 0 ? (
          <p className="lk-page__note">Lớp này chưa có trợ giảng.</p>
        ) : (
          <ul className="lk-people lk-people--actions">
            {classTas.map((ta) => (
              <li key={ta.id}>
                <PersonName person={ta} />
                <RemoveMember
                  member={ta}
                  classId={classroom.id}
                  onDone={(outcome) => onRemoveDone('TA', outcome)}
                />
              </li>
            ))}
          </ul>
        )}
        <p role="status" className="lk-page__note">
          {taStatus}
        </p>
        {taProblem ? <ProblemAlert problem={taProblem} /> : null}
        <AssignTaForm
          classId={classroom.id}
          candidates={tas.filter((ta) => !taIds.has(ta.id))}
          hasAccounts={tas.length > 0}
          onAssigned={onAssigned}
        />
      </section>

      <section className="lk-panel" aria-labelledby="class-students-title">
        <h2
          id="class-students-title"
          className="lk-panel__title"
          ref={studentHeading}
          tabIndex={-1}
        >
          Sinh viên ({students.length})
        </h2>
        <p role="status" className="lk-page__note">
          {studentStatus}
        </p>
        {studentProblem ? <ProblemAlert problem={studentProblem} /> : null}
        {students.length === 0 ? (
          <p className="lk-page__note">Chưa có sinh viên. Gửi mã mời để sinh viên tự vào lớp.</p>
        ) : (
          <div className="lk-table-wrap" role="region" aria-label="Sinh viên" tabIndex={0}>
            <table className="lk-table">
              <thead>
                <tr>
                  <th scope="col">Tên</th>
                  <th scope="col">Email</th>
                  <th scope="col">
                    <span className="lk-sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td className="lk-wrap">{personName(student)}</td>
                    <td className="lk-wrap">{student.email ?? '—'}</td>
                    <td>
                      <RemoveMember
                        member={student}
                        classId={classroom.id}
                        onDone={(outcome) => onRemoveDone('STUDENT', outcome)}
                      />
                    </td>
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
