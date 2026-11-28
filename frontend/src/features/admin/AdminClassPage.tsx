import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { NotFoundPage } from '../../app/NotFoundPage';
import {
  Button,
  ConfirmDialog,
  FormField,
  InviteCode,
  ProblemAlert,
  useToast,
} from '../../components/ui';
import type { Classroom } from '../lab-authoring/lab-api';
import { PersonName } from './AdminClassesPage';
import {
  HAS_SUBMISSIONS,
  personName,
  removalPath,
  taOptionLabel,
  type AdminMember,
  type TaAccount,
} from './admin-api';

/** An unknown class (404) or an id that is not a UUID (400) both mean "no such class". */
const NOT_FOUND_TYPES = new Set([
  'urn:leetkob:problem:class-not-found',
  'urn:leetkob:problem:invalid-request',
]);

/** What removing a member does, by role (A1). */
function consequence(member: AdminMember) {
  const name = personName(member);
  return member.role === 'TA'
    ? `${name} sẽ không còn xem được lab và hàng chờ duyệt của lớp này. Có thể gán lại sau.`
    : `${name} sẽ không còn thấy lab của lớp này. Chỉ gỡ được khi sinh viên chưa nộp bài nào trong lớp.`;
}

/**
 * Picker of the TAs not yet in this class and "Gán". "Gán" is always enabled: pressed with
 * nothing chosen it says so under the field. After an assignment the TA leaves the picker, a
 * toast confirms it and the focus returns to the picker; with nobody left, a sentence replaces
 * the form.
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
  const [error, setError] = useState<string>();
  const [problem, setProblem] = useState<ProblemDetails>();
  const [pending, setPending] = useState(false);
  /** Bumped after each assignment or empty press; the effect then focuses the picker. */
  const [focusCount, setFocusCount] = useState(0);
  const select = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (focusCount > 0) select.current?.focus();
  }, [focusCount]);

  if (!hasAccounts) return <p className="lk-page__note">Chưa có tài khoản trợ giảng.</p>;
  if (candidates.length === 0) {
    return <p className="lk-page__note">Mọi trợ giảng đã được gán cho lớp này.</p>;
  }

  async function assign() {
    if (pending) return;
    const account = candidates.find((ta) => ta.id === userId);
    if (!account) {
      setError('Chọn một trợ giảng.');
      setFocusCount((n) => n + 1);
      return;
    }
    setPending(true);
    setProblem(undefined);
    try {
      await api.request<undefined>(`/classes/${encodeURIComponent(classId)}/tas`, {
        method: 'POST',
        body: JSON.stringify({ userId: account.id }),
      });
      setUserId('');
      await onAssigned(account);
      setFocusCount((n) => n + 1);
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
        <FormField label="Gán thêm trợ giảng" error={error}>
          <select
            ref={select}
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setError(undefined);
              setProblem(undefined);
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
        <Button variant="primary" onClick={() => void assign()} aria-disabled={pending}>
          {pending ? 'Đang gán…' : 'Gán'}
        </Button>
      </div>
    </div>
  );
}

/** State of the one-member removal dialog. */
interface RemovalState {
  member: AdminMember;
  pending: boolean;
  problem?: ProblemDetails;
  /** 409: the student has submissions; nothing is left to confirm. */
  blocked: boolean;
}

/**
 * Removing one member: a ConfirmDialog naming the consequence for the role. Success closes it
 * with a toast; 409 keeps it open with the reason and only "Đóng"; another error keeps
 * "Thử lại".
 */
function RemoveMemberDialog({
  state,
  className,
  classId,
  onChange,
  onRemoved,
}: {
  state: RemovalState | undefined;
  className: string;
  classId: string;
  onChange: (next: RemovalState | undefined) => void;
  onRemoved: (member: AdminMember) => Promise<void>;
}) {
  if (!state) return null;
  const { member } = state;
  const name = personName(member);

  async function confirm() {
    if (!state || state.pending) return;
    onChange({ ...state, pending: true, problem: undefined });
    try {
      await api.request<undefined>(removalPath(classId, member), { method: 'DELETE' });
      onChange(undefined);
      await onRemoved(member);
    } catch (cause) {
      const problem = problemFrom(cause);
      if (problem.type === HAS_SUBMISSIONS) {
        onChange({
          member,
          pending: false,
          blocked: true,
          problem: {
            type: problem.type,
            status: problem.status,
            title: `${name} đã có bài nộp trong lớp nên chưa gỡ được.`,
          },
        });
      } else {
        onChange({ member, pending: false, blocked: false, problem });
      }
    }
  }

  return (
    <ConfirmDialog
      open
      title={`Gỡ ${name} khỏi ${className}?`}
      body={<p>{consequence(member)}</p>}
      confirmLabel={state.blocked ? undefined : state.problem ? 'Thử lại' : `Gỡ ${name}`}
      pendingLabel="Đang gỡ…"
      cancelLabel={state.blocked ? 'Đóng' : 'Huỷ'}
      pending={state.pending}
      problem={state.problem}
      onConfirm={() => void confirm()}
      onCancel={() => {
        onChange(undefined);
      }}
    />
  );
}

/** One class for the admin: invite code, TAs (and assigning one), students with name and email. */
export function AdminClassPage() {
  const { classId = '' } = useParams();
  const toast = useToast();
  const [classroom, setClassroom] = useState<Classroom>();
  const [members, setMembers] = useState<AdminMember[]>();
  const [tas, setTas] = useState<TaAccount[]>([]);
  const [problem, setProblem] = useState<ProblemDetails>();
  const [removal, setRemoval] = useState<RemovalState>();
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
      toast.show(`Đã gán ${personName(account)}.`);
      await reloadMembers();
    },
    [reloadMembers, toast],
  );

  /** After a removal: the toast, the reloaded list, and the focus on the section heading. */
  const onRemoved = useCallback(
    async (member: AdminMember) => {
      toast.show(`Đã gỡ ${personName(member)} khỏi lớp.`);
      await reloadMembers();
      (member.role === 'TA' ? taHeading : studentHeading).current?.focus();
    },
    [reloadMembers, toast],
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

  function askRemove(member: AdminMember) {
    setRemoval({ member, pending: false, blocked: false });
  }

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
                <span className="lk-row-actions">
                  <Button
                    aria-label={`Gỡ ${personName(ta)}`}
                    onClick={() => {
                      askRemove(ta);
                    }}
                  >
                    Gỡ
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
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
        {students.length === 0 ? (
          <p className="lk-page__note">Chưa có sinh viên. Gửi mã mời để sinh viên tự vào lớp.</p>
        ) : (
          <div className="lk-table-wrap" role="region" aria-label="Sinh viên" tabIndex={0}>
            <table className="lk-table">
              <thead>
                <tr>
                  <th scope="col">Tên</th>
                  <th scope="col">Email</th>
                  <th scope="col" className="lk-col-num">
                    Bài nộp
                  </th>
                  <th scope="col" className="lk-col-actions">
                    <span className="lk-sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const name = personName(student);
                  const locked = student.submissionCount > 0;
                  const reasonId = `submitted-${student.id}`;
                  return (
                    <tr key={student.id}>
                      <td className="lk-wrap">{name}</td>
                      <td className="lk-wrap">{student.email ?? '—'}</td>
                      <td className="lk-col-num">{student.submissionCount}</td>
                      <td className="lk-col-actions">
                        <span className="lk-row-actions">
                          {locked ? (
                            <span id={reasonId} className="lk-btn-reason">
                              Đã có bài nộp
                            </span>
                          ) : null}
                          <Button
                            aria-label={`Gỡ ${name}`}
                            disabled={locked}
                            aria-describedby={locked ? reasonId : undefined}
                            onClick={() => {
                              askRemove(student);
                            }}
                          >
                            Gỡ
                          </Button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RemoveMemberDialog
        state={removal}
        className={classroom.name}
        classId={classroom.id}
        onChange={setRemoval}
        onRemoved={onRemoved}
      />
    </section>
  );
}
