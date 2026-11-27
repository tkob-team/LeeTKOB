import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { api } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { uuidV4 } from '../../api/uuid';
import { Button, FormField, JudgeResult, ProblemAlert, type JudgeCode } from '../../components/ui';
import { verdictCaption } from './verdict-text';

const MAX_CODE_BYTES = 65_536;
const POLL_MS = 1000;

interface Lab {
  id: string;
  title: string | null;
  latestSubmissionId: string | null;
}

interface Report {
  status: 'queued' | 'grading' | 'completed';
  counted: boolean;
  verdict: JudgeCode | null;
  tests: { number: number; verdict: JudgeCode }[];
}

interface PollView {
  id: string;
  report?: Report;
  problem?: ProblemDetails;
}

/**
 * The lab chosen through `?lab=<id>` (link from the statement page), else the first lab. Read
 * from window.location rather than the router so the page also works outside a router.
 */
function initialLab(available: Lab[]): string {
  const wanted = new URLSearchParams(window.location.search).get('lab');
  const match = available.find((lab) => lab.id === wanted);
  return match?.id ?? available[0]?.id ?? '';
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
  // CPU limit of each lab, read from GET /labs/{labId} only when a TLE needs it.
  const [cpuLimits, setCpuLimits] = useState<Record<string, number>>({});
  const needsCpuLimit =
    report?.verdict === 'TLE' || report?.tests.some((test) => test.verdict === 'TLE') === true;
  const cpuTimeMs = cpuLimits[labId];
  const waiting = report?.status !== 'completed' && !view?.problem;

  useEffect(() => {
    const abort = new AbortController();
    void api
      .request<Lab[]>('/student/labs', { signal: abort.signal })
      .then((available) => {
        if (abort.signal.aborted) return;
        setLabs(available);
        setLabId(initialLab(available));
      })
      .catch((cause: unknown) => {
        if (!abort.signal.aborted) setProblem(problemFrom(cause));
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

    async function poll() {
      try {
        const next = await api.request<Report>(path, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setPollView({ id, report: next });
        if (next.status === 'completed') return;
      } catch (cause) {
        if (abort.signal.aborted) return;
        const problem = problemFrom(cause);
        setPollView({ id, problem });
        if (problem.status !== 0 && problem.status < 500) return;
      }
      timer = window.setTimeout(() => void poll(), POLL_MS);
    }

    void poll();
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [labId, submissionId]);

  useEffect(() => {
    if (!needsCpuLimit || !labId || cpuTimeMs !== undefined) return;
    const abort = new AbortController();
    api
      .request<{ cpuTimeMs: number }>(`/labs/${encodeURIComponent(labId)}`, {
        signal: abort.signal,
      })
      .then((lab) => {
        if (!abort.signal.aborted) setCpuLimits((known) => ({ ...known, [labId]: lab.cpuTimeMs }));
      })
      .catch(() => {
        // The caption then reads without the number.
      });
    return () => {
      abort.abort();
    };
  }, [needsCpuLimit, labId, cpuTimeMs]);

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
      setProblem(problemFrom(cause));
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }

  return (
    <div className="lk-stack lk-submit">
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
      {labs?.length && !submissionId ? (
        <section className="lk-result" aria-labelledby="judge-result-title">
          <h2 id="judge-result-title">Kết quả chấm</h2>
          <p>Chưa nộp bài nào.</p>
        </section>
      ) : null}
      {submissionId ? (
        <section className="lk-result" aria-labelledby="judge-result-title">
          <h2 id="judge-result-title">Kết quả chấm</h2>
          <p>
            Mã bài nộp <span className="lk-mono">{submissionId}</span>
          </p>
          {report?.counted ? <p>Bài được tính điểm (lần nộp cuối trước hạn)</p> : null}
          {view?.problem ? (
            <ProblemAlert problem={view.problem} />
          ) : (
            <p role="status" className="lk-result__overall" aria-busy={waiting}>
              {report?.verdict && report.verdict !== 'pending' ? (
                <>
                  Kết quả chung <JudgeResult code={report.verdict} size="large" />
                  <span className="lk-result__caption">
                    {verdictCaption(report.verdict, cpuTimeMs)}
                  </span>
                </>
              ) : (
                <>
                  <span className="lk-spinner" aria-hidden="true" />
                  {report?.status === 'grading' ? 'Đang chấm bài.' : 'Bài nộp đã vào hàng đợi.'}
                </>
              )}
            </p>
          )}
          {report?.tests.length ? (
            <div className="lk-table-wrap">
              <table className="lk-table" aria-label="Kết quả từng test">
                <thead>
                  <tr>
                    <th scope="col">Test</th>
                    <th scope="col">Kết quả</th>
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
