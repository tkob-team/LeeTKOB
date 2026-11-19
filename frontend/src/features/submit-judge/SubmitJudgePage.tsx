import { useEffect, useState, type SubmitEvent } from 'react';
import { Button, FormField, JudgeResult, type JudgeCode } from '../../components/ui';

const MAX_CODE_BYTES = 65_536;
const DEMO_DELAY_MS = 600;
const DEMO_TESTS: { number: number; verdict: JudgeCode }[] = [
  { number: 1, verdict: 'AC' },
  { number: 2, verdict: 'WA' },
];

export function SubmitJudgePage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const pending = submissionId !== null && finishedId !== submissionId;

  useEffect(() => {
    if (submissionId === null) return;
    const timer = window.setTimeout(() => {
      setFinishedId(submissionId);
    }, DEMO_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [submissionId]);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!code.trim()) {
      setError('Nhập mã nguồn C++17.');
      return;
    }
    if (new TextEncoder().encode(code).length > MAX_CODE_BYTES) {
      setError('Mã nguồn vượt quá 64 KB (65.536 byte UTF-8).');
      return;
    }
    setError(undefined);
    setSubmissionId(crypto.randomUUID());
  }

  return (
    <div className="lk-stack">
      <h1 className="lk-page__title">Nộp bài</h1>
      <p className="lk-page__note">Lab mẫu: Nhân đôi một số. Bản thử hiển thị kết quả giả lập.</p>
      <form onSubmit={submit}>
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
        <div className="lk-row">
          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            disabledReason="Đang chấm mẫu."
          >
            Nộp bài mẫu
          </Button>
        </div>
      </form>
      {submissionId ? (
        <section aria-labelledby="judge-result-title">
          <h2 id="judge-result-title">Kết quả chấm mẫu</h2>
          <p>
            Mã bài nộp <span className="lk-mono">{submissionId}</span>
          </p>
          <p role="status">
            {pending ? (
              'Bài nộp đã vào hàng đợi.'
            ) : (
              <>
                Kết quả chung <JudgeResult code="WA" />
              </>
            )}
          </p>
          {pending ? null : (
            <div className="lk-table-wrap">
              <table className="lk-table" aria-label="Verdict từng test">
                <thead>
                  <tr>
                    <th scope="col">Test</th>
                    <th scope="col">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {DEMO_TESTS.map(({ number, verdict }) => (
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
          )}
        </section>
      ) : null}
    </div>
  );
}
