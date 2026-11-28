import { useEffect, useState, type ClipboardEvent, type SubmitEvent } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { usePageTitle } from '../../app/usePageTitle';
import {
  Button,
  FormField,
  JudgeResult,
  Markdown,
  MarkdownInline,
  ProblemAlert,
  type JudgeCode,
} from '../../components/ui';
import {
  formatDateTime,
  formatDeduction,
  labTitle,
  type Classroom,
  type LabDetail,
} from '../lab-authoring/lab-api';
import { inviteCodeError } from './invite-code';

/** GET /student/labs (get-student-judge-status.md 1.1.0). */
interface StudentLab {
  id: string;
  title: string | null;
  latestSubmissionId: string | null;
  /** Absent from a 1.0.0 response (old backend during a deploy). */
  opensAt?: string;
  dueAt?: string;
  latestVerdict?: Exclude<JudgeCode, 'pending'> | null;
}

/** Not open yet, no submission, still grading, or the verdict of the counted submission. */
function LabStatus({ lab, now }: { lab: StudentLab; now: number }) {
  if (lab.opensAt && Date.parse(lab.opensAt) > now) {
    return <>Chưa mở (mở lúc {formatDateTime(lab.opensAt)})</>;
  }
  if (!lab.latestSubmissionId) return <>Chưa nộp</>;
  if (!lab.latestVerdict) return <>Đang chấm</>;
  return (
    <>
      Bài được tính: <JudgeResult code={lab.latestVerdict} />
    </>
  );
}

function requestProblem(cause: unknown): ProblemDetails {
  const problem = problemFrom(cause);
  if (problem.type === 'urn:leetkob:problem:lab-not-open') {
    return { ...problem, title: 'Lab chưa mở', detail: 'Đề bài hiện khi lab mở.' };
  }
  return problem;
}

function joinProblem(cause: unknown): ProblemDetails {
  const problem = problemFrom(cause);
  if (problem.type === 'urn:leetkob:problem:invalid-request') {
    return {
      ...problem,
      title: 'Mã mời không hợp lệ',
      detail: 'Mã mời gồm đúng 32 ký tự (chữ, số, - và _). Kiểm tra lại mã.',
    };
  }
  if (problem.type === 'urn:leetkob:problem:class-not-found') {
    return {
      ...problem,
      title: 'Không tìm thấy lớp',
      detail: 'Không có lớp nào dùng mã mời này. Hỏi lại trợ giảng mã mời của lớp.',
    };
  }
  return problem;
}

/** "Vào lớp bằng mã mời": POST /classes/join; joining a class again is not an error (200). */
function JoinClassForm({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [problem, setProblem] = useState<ProblemDetails>();
  const [joined, setJoined] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const inviteCode = code.trim();
    setJoined(undefined);
    setProblem(undefined);
    // Empty and malformed codes are both reported under the field, before anything is sent;
    // only a server answer (no class with this code) uses the alert below the button.
    const invalid = inviteCodeError(inviteCode);
    setError(invalid);
    if (invalid) return;
    setPending(true);
    try {
      const classroom = await api.request<Classroom>('/classes/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode }),
      });
      setCode('');
      setJoined(classroom.name);
      onJoined();
    } catch (cause) {
      setProblem(joinProblem(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="lk-panel lk-form-panel"
      noValidate
      aria-labelledby="join-class-title"
      onSubmit={(e) => void submit(e)}
    >
      <h2 id="join-class-title" className="lk-panel__title">
        Vào lớp bằng mã mời
      </h2>
      <FormField label="Mã mời" error={error} help="Trợ giảng gửi mã mời 32 ký tự của lớp.">
        <input
          className="lk-mono"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(undefined);
          }}
          onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
            // A code copied from a chat often carries spaces or a line break at either end.
            const pasted = e.clipboardData.getData('text');
            const trimmed = pasted.trim();
            if (trimmed === pasted) return;
            e.preventDefault();
            const input = e.currentTarget;
            const start = input.selectionStart ?? code.length;
            const end = input.selectionEnd ?? code.length;
            setCode(code.slice(0, start) + trimmed + code.slice(end));
            setError(undefined);
          }}
        />
      </FormField>
      <div>
        <Button type="submit" variant="primary" disabled={pending} disabledReason="Đang vào lớp…">
          Vào lớp
        </Button>
      </div>
      <p role="status" className="lk-page__note">
        {joined ? `Đã vào lớp ${joined}.` : ''}
      </p>
      {problem ? <ProblemAlert problem={problem} /> : null}
    </form>
  );
}

/** The labs of the student's classes as a table: name (links to the statement), deadline, status. */
export function StudentLabsPage() {
  const [labs, setLabs] = useState<StudentLab[]>();
  const [problem, setProblem] = useState<ProblemDetails>();
  const [now] = useState(() => Date.now());
  const [reload, setReload] = useState(0);
  usePageTitle('Đề bài');

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
  }, [reload]);

  return (
    <section className="lk-section" aria-labelledby="student-labs-title">
      <h1 id="student-labs-title" className="lk-page__title">
        Đề bài
      </h1>
      <JoinClassForm
        onJoined={() => {
          setProblem(undefined);
          setReload((n) => n + 1);
        }}
      />
      {labs?.length === 0 ? <p className="lk-page__note">Lớp của bạn chưa có lab nào.</p> : null}
      {problem ? <ProblemAlert problem={problem} /> : null}
      {!labs && !problem ? <p className="lk-page__note">Đang tải danh sách lab…</p> : null}
      {labs?.length ? (
        <div className="lk-table-wrap">
          <table className="lk-table" aria-label="Danh sách lab">
            <thead>
              <tr>
                <th scope="col">Lab</th>
                <th scope="col">Hạn nộp</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {labs.map((lab) => (
                <tr key={lab.id}>
                  <td className="lk-wrap">
                    <Link to={`/student/labs/${encodeURIComponent(lab.id)}`}>
                      {labTitle(lab.title)}
                    </Link>
                  </td>
                  <td>{lab.dueAt ? formatDateTime(lab.dueAt) : '—'}</td>
                  <td>
                    <LabStatus lab={lab} now={now} />
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

  // The student's own status for this lab (counted verdict), read after the statement; the
  // header simply leaves it out if this request fails.
  const [status, setStatus] = useState<StudentLab>();
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      const list = await api.request<StudentLab[]>('/student/labs', { signal: abort.signal });
      if (!abort.signal.aborted) setStatus(list.find((item) => item.id === labId));
    }
    load().catch(() => {
      // Optional line; the statement is what matters here.
    });
    return () => {
      abort.abort();
    };
  }, [labId]);

  usePageTitle(lab ? labTitle(lab.title) : 'Đề bài');

  const back = (
    <Link to="/student/labs" className="lk-back">
      ← Đề bài
    </Link>
  );
  if (problem) {
    return (
      <section className="lk-section">
        {back}
        <ProblemAlert problem={problem} />
        <Link to="/student/labs">Về danh sách đề bài</Link>
      </section>
    );
  }
  if (!lab) {
    return (
      <section className="lk-section">
        {back}
        <p className="lk-page__note">Đang tải đề bài…</p>
      </section>
    );
  }

  const submitPath = `/student/submit?lab=${encodeURIComponent(lab.id)}`;
  return (
    <article className="lk-section" aria-labelledby="lab-title">
      <header className="lk-section__head">
        {back}
        <div className="lk-title-row">
          <h1 id="lab-title" className="lk-page__title">
            {labTitle(lab.title)}
          </h1>
          <Link className="lk-btn lk-btn--primary" to={submitPath}>
            Nộp bài
          </Link>
        </div>
        <p className="lk-page__note">
          {status ? (
            <>
              <LabStatus lab={status} now={now} /> ·{' '}
            </>
          ) : null}
          Hạn nộp {formatDateTime(lab.dueAt)} · Mở {formatDateTime(lab.opensAt)}
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
        <Link className="lk-btn lk-btn--primary" to={submitPath}>
          Đi tới trang nộp bài
        </Link>
      </div>
    </article>
  );
}
