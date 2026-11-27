import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { api, ApiProblemError } from '../../api/client';
import type { ProblemDetails } from '../../api/problem';
import { uuidV4 } from '../../api/uuid';
import { Button, FormField, JudgeResult, ProblemAlert } from '../../components/ui';
import { readVerdictEvents, type VerdictReport } from './verdict-events';

const MAX_CODE_BYTES = 65_536;
const RETRY_MS = 1000;

interface Lab {
  id: string;
  title: string | null;
  latestSubmissionId: string | null;
}

interface PollView {
  id: string;
  report?: VerdictReport;
  problem?: ProblemDetails;
}

function requestProblem(cause: unknown): ProblemDetails {
  if (cause instanceof ApiProblemError) return cause.problem;
  return { type: 'about:blank', title: 'Không đọc được phản hồi của máy chủ', status: 0 };
}

export function SubmitJudgePage() {
  const [labs, setLabs] = useState<Lab[] | null>(null);
  const [labId, setLabId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [problem, setProblem] = useState<ProblemDetails>();
  const [posting, setPosting] = useState(false);
  const postingRef = useRef(false);
  const retry = useRef<{ labId: string; code: string; key: string }>(null);
  const [pollView, setPollView] = useState<PollView>();
  const submissionId = labs?.find((lab) => lab.id === labId)?.latestSubmissionId ?? null;
  const view = pollView?.id === submissionId ? pollView : undefined;
  const report = view?.report;

  useEffect(() => {
    const abort = new AbortController();
    void api
      .request<Lab[]>('/student/labs', { signal: abort.signal })
      .then((available) => {
        if (abort.signal.aborted) return;
        setLabs(available);
        setLabId(available[0]?.id ?? '');
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted) setProblem(requestProblem(cause));
      });
    return () => {
      abort.abort();
    };
  }, []);

  useEffect(() => {
    if (submissionId === null) return;
    const id = submissionId;
    const abort = new AbortController();
    const path = `/labs/${labId}/submissions/${id}`;
    let timer: number | undefined;
    const isAborted = () => abort.signal.aborted;

    function applyReport(next: VerdictReport) {
      if (isAborted()) return true;
      setPollView({ id, report: next });
      return next.status === 'completed';
    }

    async function follow() {
      try {
        const response = await api.openEventStream(path + '/events', abort.signal);
        if (await readVerdictEvents(response, applyReport)) return;
      } catch (cause) {
        if (isAborted()) return;
        if (cause instanceof ApiProblemError && [401, 403].includes(cause.problem.status)) {
          setPollView({ id, problem: cause.problem });
          return;
        }
        // A status read handles stream failures and older deployments.
      }
      if (isAborted()) return;
      try {
        if (applyReport(await api.request<VerdictReport>(path, { signal: abort.signal }))) return;
      } catch (cause) {
        if (isAborted()) return;
        const problem = requestProblem(cause);
        setPollView({ id, problem });
        if (problem.status !== 0 && problem.status < 500) return;
      }
      timer = window.setTimeout(() => void follow(), RETRY_MS);
    }

    void follow();
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [labId, submissionId]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (postingRef.current || !labId) return;
    if (!code.trim()) {
      setError('Nhập mã nguồn C++17.');
      return;
    }
    if (new TextEncoder().encode(code).length > MAX_CODE_BYTES) {
      setError('Mã nguồn vượt quá 64 KB (65.536 byte UTF-8).');
      return;
    }
    const prior = retry.current;
    const key = prior?.labId === labId && prior.code === code ? prior.key : uuidV4();
    retry.current = { labId, code, key };
    postingRef.current = true;
    setPosting(true);
    setError(undefined);
    setProblem(undefined);
    try {
      const { id } = await api.request<{ id: string }>(`/labs/${labId}/submissions`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({ code }),
      });
      retry.current = null;
      setLabs(
        (current) =>
          current?.map((lab) => (lab.id === labId ? { ...lab, latestSubmissionId: id } : lab)) ??
          null,
      );
    } catch (cause) {
      setProblem(requestProblem(cause));
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }

  return (
    <div className="lk-stack">
      <h1 className="lk-page__title">Nộp bài</h1>
      {problem ? <ProblemAlert problem={problem} /> : null}
      {labs?.length === 0 ? <p>Bạn chưa có lab trong các lớp đã tham gia.</p> : null}
      {labs?.length ? (
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <FormField label="Lab">
            <select
              value={labId}
              disabled={posting}
              onChange={(event) => {
                setLabId(event.target.value);
              }}
            >
              {labs.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.title ?? lab.id}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Mã nguồn C++17" help="Tối đa 64 KB (65.536 byte UTF-8)." error={error}>
            <textarea
              name="code"
              rows={10}
              value={code}
              spellCheck={false}
              onChange={(event) => {
                setCode(event.target.value);
                setError(undefined);
              }}
            />
          </FormField>
          <Button type="submit" variant="primary" disabled={posting} disabledReason="Đang gửi bài.">
            Nộp bài
          </Button>
        </form>
      ) : null}
      {submissionId ? (
        <section aria-labelledby="judge-result-title">
          <h2 id="judge-result-title">Kết quả chấm</h2>
          <p>
            Mã bài nộp <span className="lk-mono">{submissionId}</span>
          </p>
          {report?.counted ? <p>Bài được tính</p> : null}
          {view?.problem ? (
            <ProblemAlert problem={view.problem} />
          ) : (
            <p role="status">
              {report?.verdict ? (
                <>
                  Kết quả chung <JudgeResult code={report.verdict} />
                </>
              ) : report?.status === 'grading' ? (
                'Đang chấm bài.'
              ) : (
                'Bài nộp đã vào hàng đợi.'
              )}
            </p>
          )}
          {report?.tests.length ? (
            <div className="lk-table-wrap">
              <table className="lk-table" aria-label="Verdict từng test">
                <thead>
                  <tr>
                    <th scope="col">Test</th>
                    <th scope="col">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tests.map(({ number, verdict }) => (
                    <tr key={number}>
                      <th scope="row">{number}</th>
                      <td>
                        <JudgeResult code={verdict} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
