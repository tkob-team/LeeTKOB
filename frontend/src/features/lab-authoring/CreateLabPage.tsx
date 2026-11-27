import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiProblemError } from '../../api/client';
import type { ProblemDetails } from '../../api/problem';
import { Button, FormField, ProblemAlert } from '../../components/ui';
import type { LabDetail, NewLab } from './lab-api';
import {
  importLabFiles,
  type DraftConstraint,
  type DraftTest,
  type ImportResult,
} from './lab-import';

const EMPTY_TEST: DraftTest = { input: '', expectedOutput: '' };

/** `datetime-local` value (viewer's time zone) to RFC 3339 UTC, or '' when empty/invalid. */
function toIso(local: string): string {
  if (!local) return '';
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function fieldErrors(problem: ProblemDetails | undefined): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const error of problem?.errors ?? []) errors[error.field] = error.detail;
  return errors;
}

function replaceAt<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, i) => (i === index ? next : item));
}

export function CreateLabPage() {
  const { classId = '' } = useParams();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [statementMd, setStatementMd] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [cpuTimeMs, setCpuTimeMs] = useState('1000');
  const [memoryMb, setMemoryMb] = useState('256');
  const [constraints, setConstraints] = useState<DraftConstraint[]>([]);
  const [tests, setTests] = useState<DraftTest[]>([EMPTY_TEST]);
  const [imported, setImported] = useState<ImportResult>();
  const [problem, setProblem] = useState<ProblemDetails>();
  const [pending, setPending] = useState(false);
  const errors = fieldErrors(problem);

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const result = await importLabFiles(Array.from(files));
    if (result.statementMd !== undefined) setStatementMd(result.statementMd);
    if (result.title !== undefined) setTitle(result.title);
    if (result.constraints) setConstraints(result.constraints);
    if (result.tests) setTests(result.tests);
    setImported(result);
    event.target.value = '';
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: NewLab = {
      title,
      statementMd,
      opensAt: toIso(opensAt),
      dueAt: toIso(dueAt),
      cpuTimeMs: Number(cpuTimeMs),
      memoryMb: Number(memoryMb),
      tests,
      constraints: constraints.map((c) => ({
        code: c.code.trim(),
        text: c.text,
        deduction: Number(c.deduction),
      })),
    };
    setPending(true);
    setProblem(undefined);
    try {
      const lab = await api.request<LabDetail>(`/classes/${encodeURIComponent(classId)}/labs`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      void navigate('/ta/labs', { state: { created: lab.title ?? '' } });
    } catch (cause) {
      setProblem(
        cause instanceof ApiProblemError
          ? cause.problem
          : { type: 'about:blank', title: 'Không đọc được phản hồi của máy chủ', status: 0 },
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="lk-section"
      noValidate
      aria-labelledby="create-lab-title"
      onSubmit={(e) => void submit(e)}
    >
      <header className="lk-section__head">
        <h1 id="create-lab-title" className="lk-page__title">
          Tạo lab
        </h1>
        <p className="lk-page__note">
          Chọn cùng lúc file đề (.md), file ràng buộc (.json) và các file test (NN.in, NN.out). Sau
          khi nhập vẫn sửa tay được.
        </p>
        <div className="lk-row">
          <Button
            onClick={() => {
              fileInput.current?.click();
            }}
          >
            Nhập từ file
          </Button>
          <input
            ref={fileInput}
            className="lk-sr-only"
            type="file"
            multiple
            accept=".md,.json,.in,.out"
            aria-label="Chọn file đề, ràng buộc và test"
            tabIndex={-1}
            onChange={(e) => void importFiles(e)}
          />
          <Link className="lk-btn lk-btn--secondary" to="/ta/labs">
            Huỷ
          </Link>
        </div>
      </header>

      {imported ? (
        <section className="lk-panel" aria-label="Kết quả nhập file" role="status">
          <h2 className="lk-panel__title">Đã nhập từ file</h2>
          <ul className="lk-list">
            {imported.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
            {imported.warnings.map((warning) => (
              <li key={warning}>Cần xem lại: {warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {problem ? <ProblemAlert problem={problem} showType /> : null}

      <section className="lk-panel lk-form-panel" aria-label="Thông tin chung">
        <FormField label="Tiêu đề" error={errors.title}>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
        </FormField>
        <FormField
          label="Đề bài (Markdown)"
          error={errors.statementMd}
          help="Sinh viên thấy đề này khi lab mở."
        >
          <textarea
            className="lk-code-input"
            rows={12}
            value={statementMd}
            onChange={(e) => {
              setStatementMd(e.target.value);
            }}
          />
        </FormField>
        <div className="lk-cols">
          <FormField label="Mở lúc" error={errors.opensAt}>
            <input
              type="datetime-local"
              value={opensAt}
              onChange={(e) => {
                setOpensAt(e.target.value);
              }}
            />
          </FormField>
          <FormField label="Hạn nộp" error={errors.dueAt}>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => {
                setDueAt(e.target.value);
              }}
            />
          </FormField>
        </div>
        <div className="lk-cols">
          <FormField
            label="Thời gian CPU (ms)"
            error={errors.cpuTimeMs}
            help="1000–5000, mặc định 1000. Thời gian thực = 3 × CPU."
          >
            <input
              type="number"
              inputMode="numeric"
              value={cpuTimeMs}
              onChange={(e) => {
                setCpuTimeMs(e.target.value);
              }}
            />
          </FormField>
          <FormField label="Bộ nhớ (MB)" error={errors.memoryMb} help="64–512, mặc định 256.">
            <input
              type="number"
              inputMode="numeric"
              value={memoryMb}
              onChange={(e) => {
                setMemoryMb(e.target.value);
              }}
            />
          </FormField>
        </div>
      </section>

      <section className="lk-panel" aria-labelledby="constraints-title">
        <h2 id="constraints-title" className="lk-panel__title">
          Ràng buộc ({constraints.length})
        </h2>
        {errors.constraints ? <p className="lk-field__error">{errors.constraints}</p> : null}
        {constraints.map((constraint, index) => {
          const path = `constraints[${String(index)}]`;
          const update = (next: Partial<DraftConstraint>) => {
            setConstraints(replaceAt(constraints, index, { ...constraint, ...next }));
          };
          return (
            <fieldset key={index} className="lk-fieldset">
              <legend>Ràng buộc {index + 1}</legend>
              <div className="lk-cols">
                <FormField label="Mã" error={errors[`${path}.code`]}>
                  <input
                    value={constraint.code}
                    onChange={(e) => {
                      update({ code: e.target.value });
                    }}
                  />
                </FormField>
                <FormField
                  label="Khoản trừ"
                  error={errors[`${path}.deduction`]}
                  help="0 < trừ ≤ 10"
                >
                  <input
                    inputMode="decimal"
                    value={constraint.deduction}
                    onChange={(e) => {
                      update({ deduction: e.target.value });
                    }}
                  />
                </FormField>
              </div>
              <FormField label="Nội dung" error={errors[`${path}.text`]}>
                <textarea
                  rows={3}
                  value={constraint.text}
                  onChange={(e) => {
                    update({ text: e.target.value });
                  }}
                />
              </FormField>
              <div>
                <Button
                  variant="danger"
                  onClick={() => {
                    setConstraints(constraints.filter((_, i) => i !== index));
                  }}
                >
                  Xoá ràng buộc {index + 1}
                </Button>
              </div>
            </fieldset>
          );
        })}
        <div>
          <Button
            onClick={() => {
              setConstraints([
                ...constraints,
                { code: `C${String(constraints.length + 1)}`, text: '', deduction: '' },
              ]);
            }}
          >
            Thêm ràng buộc
          </Button>
        </div>
      </section>

      <section className="lk-panel" aria-labelledby="tests-title">
        <h2 id="tests-title" className="lk-panel__title">
          Test ({tests.length})
        </h2>
        <p className="lk-page__note">Sinh viên không bao giờ thấy test.</p>
        {errors.tests ? <p className="lk-field__error">{errors.tests}</p> : null}
        {tests.map((test, index) => {
          const path = `tests[${String(index)}]`;
          const update = (next: Partial<DraftTest>) => {
            setTests(replaceAt(tests, index, { ...test, ...next }));
          };
          return (
            <fieldset key={index} className="lk-fieldset">
              <legend>Test {index + 1}</legend>
              <div className="lk-cols">
                <FormField label={`Đầu vào ${String(index + 1)}`} error={errors[`${path}.input`]}>
                  <textarea
                    className="lk-code-input"
                    rows={4}
                    value={test.input}
                    onChange={(e) => {
                      update({ input: e.target.value });
                    }}
                  />
                </FormField>
                <FormField
                  label={`Đầu ra mong đợi ${String(index + 1)}`}
                  error={errors[`${path}.expectedOutput`]}
                >
                  <textarea
                    className="lk-code-input"
                    rows={4}
                    value={test.expectedOutput}
                    onChange={(e) => {
                      update({ expectedOutput: e.target.value });
                    }}
                  />
                </FormField>
              </div>
              <div>
                <Button
                  variant="danger"
                  disabled={tests.length === 1}
                  disabledReason={tests.length === 1 ? 'Lab cần ít nhất 1 test.' : undefined}
                  onClick={() => {
                    setTests(tests.filter((_, i) => i !== index));
                  }}
                >
                  Xoá test {index + 1}
                </Button>
              </div>
            </fieldset>
          );
        })}
        <div>
          <Button
            onClick={() => {
              setTests([...tests, EMPTY_TEST]);
            }}
          >
            Thêm test
          </Button>
        </div>
      </section>

      <div className="lk-row">
        <Button type="submit" variant="primary" disabled={pending} disabledReason="Đang tạo lab…">
          Tạo lab
        </Button>
      </div>
    </form>
  );
}
