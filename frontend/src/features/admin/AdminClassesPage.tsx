import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { EmptyState } from '../../app/EmptyState';
import { Button, CopyButton, FormField, ProblemAlert } from '../../components/ui';
import type { Classroom } from '../lab-authoring/lab-api';
import { classNameError, taLabel, type ClassMember, type TaAccount } from './admin-api';

interface ClassRow {
  classroom: Classroom;
  members: ClassMember[];
}

const classPath = (id: string) => `/classes/${encodeURIComponent(id)}`;

async function loadRow(classroom: Classroom, signal?: AbortSignal): Promise<ClassRow> {
  const members = await api.request<ClassMember[]>(`${classPath(classroom.id)}/members`, {
    signal,
  });
  return { classroom, members };
}

/** Creates a class; reports an empty or too long name before sending anything. */
function CreateClassForm({ onCreated }: { onCreated: (classroom: Classroom) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [problem, setProblem] = useState<ProblemDetails>();
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const nameError = classNameError(name);
    setError(nameError);
    setProblem(undefined);
    if (nameError) return;
    setPending(true);
    try {
      const created = await api.request<Classroom>('/classes', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      setName('');
      onCreated(created);
    } catch (cause) {
      setProblem(problemFrom(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="lk-panel lk-form-panel"
      noValidate
      aria-labelledby="create-class-title"
      onSubmit={(e) => void submit(e)}
    >
      <h2 id="create-class-title" className="lk-panel__title">
        Tạo lớp
      </h2>
      {problem ? <ProblemAlert problem={problem} /> : null}
      <FormField label="Tên lớp" error={error}>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </FormField>
      <div>
        <Button type="submit" variant="primary" disabled={pending} disabledReason="Đang tạo lớp…">
          Tạo lớp
        </Button>
      </div>
    </form>
  );
}

/** Dropdown of TA accounts and "Gán"; assigning the same TA again is not an error (204). */
function AssignTa({
  row,
  tas,
  onAssigned,
}: {
  row: ClassRow;
  tas: TaAccount[];
  onAssigned: (classId: string) => Promise<void>;
}) {
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState<ProblemDetails>();
  const [pending, setPending] = useState(false);
  const { classroom } = row;

  if (tas.length === 0) return <span className="lk-page__note">Chưa có tài khoản trợ giảng.</span>;

  async function assign() {
    const account = tas.find((ta) => ta.id === userId);
    if (!account) return;
    setPending(true);
    setStatus('');
    setProblem(undefined);
    try {
      await api.request<undefined>(`${classPath(classroom.id)}/tas`, {
        method: 'POST',
        body: JSON.stringify({ userId: account.id }),
      });
      setStatus(`Đã gán ${taLabel(account)}.`);
      await onAssigned(classroom.id);
    } catch (cause) {
      setProblem(problemFrom(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="lk-section">
      <div className="lk-row">
        <select
          aria-label={`Trợ giảng cho lớp ${classroom.name}`}
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            setStatus('');
          }}
        >
          <option value="">Chọn trợ giảng…</option>
          {tas.map((ta) => (
            <option key={ta.id} value={ta.id}>
              {taLabel(ta)}
            </option>
          ))}
        </select>
        <Button
          onClick={() => void assign()}
          disabled={pending || userId === ''}
          disabledReason={pending ? 'Đang gán…' : 'Chọn một trợ giảng trước.'}
          aria-label={`Gán trợ giảng cho lớp ${classroom.name}`}
        >
          Gán
        </Button>
      </div>
      <span role="status" className="lk-page__note">
        {status}
      </span>
      {problem ? <ProblemAlert problem={problem} /> : null}
    </div>
  );
}

/** Admin home: every class with its invite code and member counts, creating classes, assigning TAs. */
export function AdminClassesPage() {
  const [rows, setRows] = useState<ClassRow[]>();
  const [tas, setTas] = useState<TaAccount[]>([]);
  const [problem, setProblem] = useState<ProblemDetails>();
  const [created, setCreated] = useState<string>();

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      const [classes, accounts] = await Promise.all([
        api.request<Classroom[]>('/classes', { signal: abort.signal }),
        api.request<TaAccount[]>('/admin/tas', { signal: abort.signal }),
      ]);
      const loaded = await Promise.all(classes.map((c) => loadRow(c, abort.signal)));
      return { loaded, accounts };
    }
    load()
      .then(({ loaded, accounts }) => {
        if (abort.signal.aborted) return;
        setRows(loaded);
        setTas(accounts);
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted) setProblem(problemFrom(cause));
      });
    return () => {
      abort.abort();
    };
  }, []);

  const refreshRow = useCallback(async (classId: string) => {
    try {
      const row = await api.request<Classroom>(classPath(classId)).then((c) => loadRow(c));
      setRows((current) => current?.map((r) => (r.classroom.id === classId ? row : r)));
    } catch (cause) {
      setProblem(problemFrom(cause));
    }
  }, []);

  function onCreated(classroom: Classroom) {
    setCreated(classroom.name);
    const row: ClassRow = { classroom, members: [] };
    setRows((current) =>
      [...(current ?? []), row].sort((a, b) =>
        a.classroom.name.localeCompare(b.classroom.name, 'vi'),
      ),
    );
  }

  return (
    <section className="lk-section" aria-labelledby="admin-classes-title">
      <header className="lk-section__head">
        <h1 id="admin-classes-title" className="lk-page__title">
          Lớp học
        </h1>
        <p className="lk-page__note">
          Tạo lớp, gửi mã mời cho sinh viên và gán trợ giảng cho từng lớp.
        </p>
      </header>
      <CreateClassForm onCreated={onCreated} />
      {created ? (
        <p role="status" className="lk-page__note">
          Đã tạo lớp {created}.
        </p>
      ) : null}
      {problem ? <ProblemAlert problem={problem} /> : null}
      {!rows && !problem ? <p className="lk-page__note">Đang tải danh sách lớp…</p> : null}
      {rows?.length === 0 ? (
        <EmptyState title="Chưa có lớp">Tạo lớp đầu tiên bằng biểu mẫu phía trên.</EmptyState>
      ) : null}
      {rows?.length ? (
        <div className="lk-table-wrap">
          <table className="lk-table" aria-label="Danh sách lớp">
            <thead>
              <tr>
                <th scope="col">Lớp</th>
                <th scope="col">Mã mời</th>
                <th scope="col">Trợ giảng</th>
                <th scope="col">Sinh viên</th>
                <th scope="col">Gán trợ giảng</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const { classroom, members } = row;
                const code = classroom.inviteCode;
                return (
                  <tr key={classroom.id}>
                    <td className="lk-wrap">{classroom.name}</td>
                    <td>
                      {code ? (
                        <span className="lk-row">
                          <code className="lk-mono">{code}</code>
                          <CopyButton getText={() => code} label="Sao chép mã mời" />
                        </span>
                      ) : (
                        'Chưa có mã mời'
                      )}
                    </td>
                    <td>{members.filter((m) => m.role === 'TA').length}</td>
                    <td>{members.filter((m) => m.role === 'STUDENT').length}</td>
                    <td>
                      <AssignTa row={row} tas={tas} onAssigned={refreshRow} />
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
