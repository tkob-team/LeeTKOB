import { useEffect, useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { EmptyState } from '../../app/EmptyState';
import { Button, FormField, InviteCode, ProblemAlert, useToast } from '../../components/ui';
import type { Classroom } from '../lab-authoring/lab-api';
import { adminClassPath, classNameError, personName, type AdminClass } from './admin-api';

/** Creates a class; reports an empty or too long name under the field before sending anything. */
function CreateClassForm({ onCreated }: { onCreated: (classroom: Classroom) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [problem, setProblem] = useState<ProblemDetails>();
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
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

/** A name with the email in small text below it. */
export function PersonName({ person }: { person: AdminClass['tas'][number] }) {
  return (
    <span className="lk-person">
      <span>{personName(person)}</span>
      {person.email && person.email !== personName(person) ? (
        <small className="lk-people__email">{person.email}</small>
      ) : null}
    </span>
  );
}

/** People with the email in small text below the name; every person is listed. */
export function PeopleList({ people }: { people: AdminClass['tas'] }) {
  return (
    <ul className="lk-people">
      {people.map((person) => (
        <li key={person.id}>
          <PersonName person={person} />
        </li>
      ))}
    </ul>
  );
}

/** Admin home: every class (GET /admin/classes) with its TAs, student count and invite code. */
export function AdminClassesPage() {
  const [classes, setClasses] = useState<AdminClass[]>();
  const [problem, setProblem] = useState<ProblemDetails>();
  const toast = useToast();

  useEffect(() => {
    const abort = new AbortController();
    api
      .request<AdminClass[]>('/admin/classes', { signal: abort.signal })
      .then((list) => {
        if (!abort.signal.aborted) setClasses(list);
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted) setProblem(problemFrom(cause));
      });
    return () => {
      abort.abort();
    };
  }, []);

  function onCreated(classroom: Classroom) {
    toast.show(`Đã tạo lớp ${classroom.name}.`);
    const row: AdminClass = {
      id: classroom.id,
      name: classroom.name,
      inviteCode: classroom.inviteCode ?? null,
      tas: [],
      studentCount: 0,
    };
    setClasses((current) =>
      [...(current ?? []), row].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    );
  }

  return (
    <section className="lk-section" aria-labelledby="admin-classes-title">
      <header className="lk-section__head">
        <h1 id="admin-classes-title" className="lk-page__title">
          Lớp học
        </h1>
        <p className="lk-page__note">
          Tạo lớp và gửi mã mời cho sinh viên. Mở một lớp để xem thành viên và gán trợ giảng.
        </p>
      </header>
      <CreateClassForm onCreated={onCreated} />
      {problem ? <ProblemAlert problem={problem} /> : null}
      {!classes && !problem ? <p className="lk-page__note">Đang tải danh sách lớp…</p> : null}
      {classes?.length === 0 ? (
        <EmptyState title="Chưa có lớp">Tạo lớp đầu tiên bằng biểu mẫu phía trên.</EmptyState>
      ) : null}
      {classes?.length ? (
        // On a narrow screen the table scrolls inside this frame, which takes keyboard focus.
        <div className="lk-table-wrap" role="region" aria-label="Danh sách lớp" tabIndex={0}>
          <table className="lk-table">
            <thead>
              <tr>
                <th scope="col">Lớp</th>
                <th scope="col">Trợ giảng</th>
                <th scope="col">Sinh viên</th>
                <th scope="col">Mã mời</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id}>
                  <td className="lk-wrap">
                    <Link to={adminClassPath(c.id)}>{c.name}</Link>
                  </td>
                  <td className="lk-wrap">
                    {c.tas.length === 0 ? (
                      <span className="lk-page__note">Chưa có trợ giảng</span>
                    ) : (
                      <PeopleList people={c.tas} />
                    )}
                  </td>
                  <td>{c.studentCount}</td>
                  <td>
                    {c.inviteCode ? (
                      <InviteCode code={c.inviteCode} classLabel={c.name} />
                    ) : (
                      'Chưa có mã mời'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
