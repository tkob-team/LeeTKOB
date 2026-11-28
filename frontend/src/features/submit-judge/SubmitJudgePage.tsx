import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { api, ApiProblemError } from '../../api/client';
import { problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { uuidV4 } from '../../api/uuid';
import { usePageTitle } from '../../app/usePageTitle';
import { Button, FormField, JudgeResult, ProblemAlert, type JudgeCode } from '../../components/ui';
import { formatDateTime } from '../lab-authoring/lab-api';
import { submissionLabel } from '../review-queue/review-queue';
import { CopyIdButton } from './CopyIdButton';
import { StatementLink } from './StatementLink';
import { readVerdictEvents, type VerdictReport } from './verdict-events';
import { verdictCaption } from './verdict-text';

const MAX_CODE_BYTES = 65_536;
const RETRY_MS = 1000;

/** GET /student/labs (get-student-judge-status.md 1.1.0); dates and verdict absent in 1.0.0. */
interface Lab {
  id: string;
  title: string | null;
  latestSubmissionId: string | null;
  dueAt?: string;
  latestVerdict?: Exclude<JudgeCode, 'pending'> | null;
}

/**
 * What happens to the counted submission (FAQ-02: the last submission before the deadline
 * counts, whatever its result), said before the student clicks "Nộp bài".
 */
function CountedNote({ lab, verdict }: { lab: Lab; verdict: JudgeCode | null | undefined }) {
  return (
    <div className="lk-submit__note lk-page__note">
      {lab.latestSubmissionId ? (
        // Plain text: the coloured result of that same submission is shown under "Kết quả chấm".
        <p>
          {`Bài được tính hiện tại: ${verdict && verdict !== 'pending' ? verdict : 'đang chấm'}. Lần nộp này sẽ thay bài được tính, dù kết quả thế nào.`}
        </p>
      ) : (
        <p>Bài nộp cuối cùng trước hạn sẽ được tính.</p>
      )}
      <p>
        {lab.dueAt ? <>Hạn nộp {formatDateTime(lab.dueAt)} · </> : null}
        <StatementLink labId={lab.id} />
      </p>
    </div>
  );
}

interface PollView {
  id: string;
  report?: VerdictReport;
  problem?: ProblemDetails;
}

/**
 * The lab chosen through `?lab=<id>` (link from the statement page), else the first lab. An id
 * that is not in the list chooses nothing (`unknown`), so the student never submits to a lab
 * they did not pick. Read from window.location rather than the router so the page also works
 * outside a router.
 */
function initialLab(available: Lab[]): { id: string; unknown: boolean } {
  const wanted = new URLSearchParams(window.location.search).get('lab');
  if (wanted === null) return { id: available[0]?.id ?? '', unknown: false };
  const match = available.find((lab) => lab.id === wanted);
  return match ? { id: match.id, unknown: false } : { id: '', unknown: true };
}

export function SubmitJudgePage() {
  const [labs, setLabs] = useState<Lab[] | null>(null);
  const [labId, setLabId] = useState('');
  const [unknownLab, setUnknownLab] = useState(false);
  const [labError, setLabError] = useState<string>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [problem, setProblem] = useState<ProblemDetails>();
  const [posting, setPosting] = useState(false);
  const postingRef = useRef(false);
  const retry = useRef<{ labId: string; code: string; key: string }>(null);
  const [pollView, setPollView] = useState<PollView>();
  const selectedLab = labs?.find((lab) => lab.id === labId);
  const submissionId = selectedLab?.latestSubmissionId ?? null;
  const view = pollView?.id === submissionId ? pollView : undefined;
  const report = view?.report;
  // Verdict of the counted submission: the polled report once there is one, else the list's.
  const countedVerdict = report
    ? report.status === 'completed'
      ? report.verdict
      : null
    : selectedLab?.latestVerdict;
  usePageTitle('Nộp bài');
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
        const initial = initialLab(available);
        setLabId(initial.id);
        setUnknownLab(initial.unknown);
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
        const problem = problemFrom(cause);
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
    if (postingRef.current) return;
    if (!labId) {
      setLabError('Chọn một lab.');
      return;
    }
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
          current?.map((lab) =>
            lab.id === labId ? { ...lab, latestSubmissionId: id, latestVerdict: null } : lab,
          ) ?? null,
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
      {unknownLab ? (
        <div className="lk-problem" role="alert">
          <p className="lk-problem__title">Không tìm thấy lab này.</p>
          <p className="lk-problem__detail">
            Đường dẫn trỏ tới một lab không có trong các lớp của bạn. Chọn lab trong danh sách.
          </p>
        </div>
      ) : null}
      {labs?.length === 0 ? <p>Bạn chưa có lab trong các lớp đã tham gia.</p> : null}
      {labs?.length ? (
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <FormField label="Lab" error={labError}>
            <select
              value={labId}
              disabled={posting}
              onChange={(event) => {
                setLabId(event.target.value);
                setUnknownLab(false);
                setLabError(undefined);
              }}
            >
              {labId === '' ? (
                <option value="" disabled>
                  Chọn lab
                </option>
              ) : null}
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
          {selectedLab ? <CountedNote lab={selectedLab} verdict={countedVerdict} /> : null}
        </form>
      ) : null}
      {labs?.length && labId && !submissionId ? (
        <section className="lk-result" aria-labelledby="judge-result-title">
          <h2 id="judge-result-title">Kết quả chấm</h2>
          <p>Chưa nộp bài nào.</p>
        </section>
      ) : null}
      {submissionId ? (
        <section className="lk-result" aria-labelledby="judge-result-title">
          <h2 id="judge-result-title">Kết quả chấm</h2>
          <p className="lk-submission-id">
            <span>
              Mã bài nộp{' '}
              <span className="lk-mono" title={submissionId}>
                {submissionLabel(submissionId)}
              </span>
            </span>
            <CopyIdButton id={submissionId} />
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
