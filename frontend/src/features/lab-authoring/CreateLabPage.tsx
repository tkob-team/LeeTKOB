import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../../api/client';
import { localizedFieldErrors, problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { usePageTitle } from '../../app/usePageTitle';
import { Button, FormField, ProblemAlert } from '../../components/ui';
import type { Classroom, LabDetail, NewLab } from './lab-api';
import { toIso } from './lab-dates';
import { errorSummary, labFormErrors } from './lab-form-check';
import {
  importLabFiles,
  type DraftConstraint,
  type DraftTest,
  type ImportResult,
} from './lab-import';

const EMPTY_TEST: DraftTest = { input: '', expectedOutput: '' };

/** Moves the viewer to a field with an error: focus, and scroll it to the middle of the screen. */
function reveal(input: HTMLElement | null) {
  if (!input) return;
  input.focus();
  // Not every environment implements scrollIntoView (jsdom).
  if (typeof input.scrollIntoView === 'function') {
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function replaceAt<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, i) => (i === index ? next : item));
}

export interface CreateLabPageProps {
  /** The class, once CreateLabRoute has checked it; names the page and the way back. */
  classroom?: Classroom;
}

export function CreateLabPage({ classroom }: CreateLabPageProps) {
  const { classId = '' } = useParams();
  const navigate = useNavigate();
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Client-side errors by API field path ("title", "tests[0].expectedOutput").
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  usePageTitle(classroom ? `Tạo lab · ${classroom.name}` : 'Tạo lab');
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
  const errors: Record<string, string> = { ...localizedFieldErrors(problem), ...clientErrors };
  const errorCount = Object.keys(errors).length;

  /** An edited field drops the errors shown for it (client check and server answer). */
  function clearErrors(...fields: string[]) {
    setClientErrors((current) =>
      fields.some((field) => field in current)
        ? Object.fromEntries(Object.entries(current).filter(([key]) => !fields.includes(key)))
        : current,
    );
    setProblem((current) =>
      current?.errors?.some((e) => fields.includes(e.field))
        ? { ...current, errors: current.errors.filter((e) => !fields.includes(e.field)) }
        : current,
    );
  }

  /** A changed date drops the errors shown for both dates, since either may be the wrong one. */
  function clearDateErrors() {
    clearErrors('opensAt', 'dueAt');
  }

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
    const invalid = labFormErrors({
      title,
      statementMd,
      opensAt,
      dueAt,
      cpuTimeMs,
      memoryMb,
      tests,
    });
    setClientErrors(invalid);
    const first = Object.keys(invalid)[0];
    if (first !== undefined) {
      setProblem(undefined);
      reveal(form.current?.querySelector<HTMLElement>(`[data-field="${first}"]`) ?? null);
      return;
    }
    // toIso always ends in `Z`, so the server never has to guess the time zone.
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
      void navigate(`/ta/classes/${encodeURIComponent(classId)}`, {
        state: { created: lab.title ?? '' },
      });
    } catch (cause) {
      setProblem(problemFrom(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      ref={form}
      className="lk-section"
      noValidate
      aria-labelledby="create-lab-title"
      onSubmit={(e) => void submit(e)}
    >
      <header className="lk-section__head">
        {classroom ? (
          <Link to={`/ta/classes/${encodeURIComponent(classId)}`} className="lk-back">
            ← {classroom.name}
          </Link>
        ) : null}
        <h1 id="create-lab-title" className="lk-page__title">
          {classroom ? `Tạo lab cho ${classroom.name}` : 'Tạo lab'}
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
          <Link
            className="lk-btn lk-btn--secondary"
            to={`/ta/classes/${encodeURIComponent(classId)}`}
          >
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

      {problem ? <ProblemAlert problem={problem} /> : null}

      <section className="lk-panel lk-form-panel" aria-label="Thông tin chung">
        <FormField label="Tiêu đề" error={errors.title}>
          <input
            data-field="title"
            required
            aria-required="true"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clearErrors('title');
            }}
          />
        </FormField>
        <FormField
          label="Đề bài (Markdown)"
          error={errors.statementMd}
          help="Sinh viên thấy đề này khi lab mở."
        >
          <textarea
            data-field="statementMd"
            required
            aria-required="true"
            className="lk-code-input"
            rows={12}
            value={statementMd}
            onChange={(e) => {
              setStatementMd(e.target.value);
              clearErrors('statementMd');
            }}
          />
        </FormField>
        <div className="lk-cols">
          <FormField label="Mở lúc" error={errors.opensAt}>
            <input
              data-field="opensAt"
              type="datetime-local"
              required
              aria-required="true"
              value={opensAt}
              onChange={(e) => {
                setOpensAt(e.target.value);
                clearDateErrors();
              }}
            />
          </FormField>
          <FormField label="Hạn nộp" error={errors.dueAt}>
            <input
              data-field="dueAt"
              type="datetime-local"
              required
              aria-required="true"
              value={dueAt}
              onChange={(e) => {
                setDueAt(e.target.value);
                clearDateErrors();
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
              data-field="cpuTimeMs"
              type="number"
              inputMode="numeric"
              value={cpuTimeMs}
              onChange={(e) => {
                setCpuTimeMs(e.target.value);
                clearErrors('cpuTimeMs');
              }}
            />
          </FormField>
          <FormField label="Bộ nhớ (MB)" error={errors.memoryMb} help="64–512, mặc định 256.">
            <input
              data-field="memoryMb"
              type="number"
              inputMode="numeric"
              value={memoryMb}
              onChange={(e) => {
                setMemoryMb(e.target.value);
                clearErrors('memoryMb');
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
                    data-field={`${path}.expectedOutput`}
                    className="lk-code-input"
                    rows={4}
                    value={test.expectedOutput}
                    onChange={(e) => {
                      update({ expectedOutput: e.target.value });
                      clearErrors(`${path}.expectedOutput`);
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
        <p className="lk-field__error" role="status">
          {errorSummary(errorCount)}
        </p>
      </div>
    </form>
  );
}
