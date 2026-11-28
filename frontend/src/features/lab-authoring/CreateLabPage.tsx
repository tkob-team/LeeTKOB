import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../../api/client';
import { localizedFieldErrors, problemFrom } from '../../api/problem-message';
import type { ProblemDetails } from '../../api/problem';
import { usePageTitle } from '../../app/usePageTitle';
import { Button, ConfirmDialog, FormField, ProblemAlert, useToast } from '../../components/ui';
import type { Classroom, LabDetail, NewLab } from './lab-api';
import { toIso } from './lab-dates';
import { errorSummary, labFormErrors } from './lab-form-check';
import {
  importLabFiles,
  importLabFolder,
  type DraftConstraint,
  type ImportResult,
} from './lab-import';
import {
  formatNames,
  isBlank,
  mergeTests,
  nextTestName,
  planTests,
  sameConstraints,
  type FormTest,
} from './lab-merge';

const FIRST_TEST: FormTest = { name: '01', input: '', expectedOutput: '' };

/** A question asked in the ConfirmDialog during an import. */
interface Question {
  title: string;
  body: string;
  confirmLabel: string;
  alternativeLabel?: string;
}
type Answer = 'confirm' | 'alternative' | 'cancel';

/** The imported tests with their numbers, in number order. */
function numbered(result: ImportResult): FormTest[] {
  const names = result.testNames ?? [];
  return (result.tests ?? []).map((test, i) => ({ ...test, name: names[i] ?? String(i + 1) }));
}

/** "a", "a và b", "a, b và c". */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} và ${words[words.length - 1] ?? ''}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `<input webkitdirectory>`: not in React's typings, so it is set on the element. */
function pickDirectory(input: HTMLInputElement | null) {
  input?.setAttribute('webkitdirectory', '');
}

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
  const toast = useToast();
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
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
  const [tests, setTests] = useState<FormTest[]>([FIRST_TEST]);
  /** What the last import could not use; the form itself shows what it filled. */
  const [importWarnings, setImportWarnings] = useState<ImportResult['warnings']>([]);
  const [problem, setProblem] = useState<ProblemDetails>();
  const [pending, setPending] = useState(false);
  /** The import's open question and the function that hands back the answer. */
  const [question, setQuestion] = useState<{
    id: number;
    question: Question;
    resolve: (answer: Answer) => void;
  }>();
  const questionCount = useRef(0);
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

  /** Opens the ConfirmDialog with `next` and waits for the TA's answer. */
  function ask(next: Question): Promise<Answer> {
    return new Promise((resolve) => {
      questionCount.current += 1;
      setQuestion({ id: questionCount.current, question: next, resolve });
    });
  }

  function answer(choice: Answer) {
    const current = question;
    setQuestion(undefined);
    current?.resolve(choice);
  }

  /** Test errors are keyed by position, which an import changes. */
  function clearTestErrors() {
    setClientErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith('tests'))),
    );
  }

  /** The picked files, read once; the input is emptied so the same files can be picked again. */
  function takeFiles(event: ChangeEvent<HTMLInputElement>): File[] {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    return files;
  }

  /**
   * Adds what the files hold to the form, part by part. New test numbers are added; a test
   * number already on the form with other content, a different statement or different
   * constraints are replaced only after a ConfirmDialog. What changed is one toast; what could
   * not be used stays in the "Cần xem lại" panel.
   */
  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = takeFiles(event);
    if (files.length === 0) return;
    const result = await importLabFiles(files);
    setImportWarnings(result.warnings);
    const filled: string[] = [];
    const sentences: string[] = [];
    let readSomething = false;

    if (result.statementMd !== undefined) {
      readSomething = true;
      const incoming = result.statementMd;
      if (incoming !== statementMd) {
        const go =
          statementMd.trim() === '' ||
          (await ask({
            title: 'Thay đề bài đang có?',
            body: 'Đề bài và tiêu đề trên form sẽ được thay bằng nội dung statement.md vừa chọn.',
            confirmLabel: 'Thay đề bài',
          })) === 'confirm';
        if (go) {
          setStatementMd(incoming);
          if (result.title !== undefined) setTitle(result.title);
          clearErrors('statementMd', 'title');
          filled.push(result.title !== undefined ? 'đề bài và tiêu đề' : 'đề bài');
        }
      }
    }

    if (result.constraints) {
      readSomething = true;
      const incoming = result.constraints;
      if (!sameConstraints(incoming, constraints)) {
        const count = String(constraints.length);
        const go =
          constraints.length === 0 ||
          (await ask({
            title: `Thay ${count} ràng buộc đang có?`,
            body: `constraints.json có ${String(incoming.length)} ràng buộc; ${count} ràng buộc trên form sẽ bị thay toàn bộ.`,
            confirmLabel: 'Thay ràng buộc',
          })) === 'confirm';
        if (go) {
          setConstraints(incoming);
          filled.push(`${String(incoming.length)} ràng buộc`);
        }
      }
    }

    const incomingTests = numbered(result);
    if (incomingTests.length > 0) {
      readSomething = true;
      const plan = planTests(tests, incomingTests);
      const added = plan.added.map((t) => t.name);
      const addedText = `${String(added.length)} test (${formatNames(added)})`;
      if (plan.conflicts.length === 0) {
        if (added.length > 0) {
          const next = mergeTests(tests, incomingTests);
          setTests(next);
          clearTestErrors();
          sentences.push(`Đã thêm ${addedText}, tổng ${String(next.length)} test.`);
        }
      } else {
        const overlap = [...plan.conflicts, ...plan.same];
        const kept = plan.kept;
        const choice = await ask({
          title: 'Ghi đè test trùng số?',
          body:
            `${String(overlap.length)} test trùng số (${formatNames(overlap)}) sẽ bị ghi đè; ` +
            (kept.length > 0
              ? `${String(kept.length)} test cũ (${formatNames(kept)}) vẫn giữ.`
              : 'không còn test cũ nào khác.') +
            (added.length > 0 ? ` ${addedText} mới sẽ được thêm.` : ''),
          confirmLabel:
            `Ghi đè ${formatNames(overlap, 2)}` +
            (kept.length > 0 ? `, giữ ${formatNames(kept, 2)}` : ''),
          alternativeLabel: `Thay toàn bộ bằng ${String(incomingTests.length)} test mới`,
        });
        if (choice === 'confirm') {
          const next = mergeTests(tests, incomingTests);
          setTests(next);
          clearTestErrors();
          sentences.push(
            `Đã ghi đè ${String(overlap.length)} test (${formatNames(overlap)})` +
              (added.length > 0 ? `, thêm ${addedText}` : '') +
              `, tổng ${String(next.length)} test.`,
          );
        } else if (choice === 'alternative') {
          setTests(mergeTests([], incomingTests));
          clearTestErrors();
          sentences.push(`Đã thay toàn bộ bằng ${String(incomingTests.length)} test mới.`);
        }
      }
    }

    if (filled.length > 0) sentences.unshift(`Đã nhập từ file: ${filled.join(', ')}.`);
    if (sentences.length > 0) toast.show(sentences.join(' '));
    else if (readSomething) toast.show('Không có gì thay đổi.');
  }

  /**
   * Loads one problem folder. Only the kinds the folder holds (statement, constraints, tests)
   * are replaced; a kind it lacks stays as it is on the form and a warning toast says so. A
   * form that already holds something in a kind to be replaced asks first; otherwise the
   * folder is loaded at once.
   */
  async function importFolder(event: ChangeEvent<HTMLInputElement>) {
    const files = takeFiles(event);
    if (files.length === 0) return;
    const result = await importLabFolder(files);
    setImportWarnings(result.warnings);
    const folder = result.folder ?? 'đã chọn';
    const incomingTests = numbered(result);
    const hasStatement = result.statementMd !== undefined;
    const hasConstraints = result.constraints !== undefined;
    const hasTests = incomingTests.length > 0;
    if (!hasStatement && !hasConstraints && !hasTests) {
      toast.warn(`Thư mục ${folder} không có đề, ràng buộc hay test nào; form được giữ nguyên.`);
      return;
    }

    const kinds = [
      ...(hasStatement ? ['đề'] : []),
      ...(hasConstraints ? ['ràng buộc'] : []),
      ...(hasTests ? ['test'] : []),
    ];
    const replaced = [
      ...(hasStatement ? ['tiêu đề và đề bài'] : []),
      ...(hasConstraints ? ['mọi ràng buộc'] : []),
      ...(hasTests ? ['mọi test'] : []),
    ];
    const kept = [
      ...(hasStatement ? [] : ['đề bài']),
      ...(hasConstraints ? [] : ['ràng buộc']),
      ...(hasTests ? [] : ['test']),
    ];
    const willReplaceContent =
      (hasStatement && (title.trim() !== '' || statementMd.trim() !== '')) ||
      (hasConstraints && constraints.length > 0) ||
      (hasTests && tests.some((t) => !isBlank(t)));
    if (
      willReplaceContent &&
      (await ask({
        title: `Thay toàn bộ ${joinWords(kinds)} bằng nội dung thư mục ${folder}?`,
        body:
          `${capitalize(joinWords(replaced))} trên form sẽ được thay.` +
          (kept.length > 0
            ? ` ${capitalize(joinWords(kept))} giữ nguyên vì thư mục không có.`
            : '') +
          ' Hai mốc giờ, thời gian CPU và bộ nhớ giữ nguyên.',
        confirmLabel: `Thay bằng thư mục ${folder}`,
      })) !== 'confirm'
    ) {
      return;
    }

    const parts: string[] = [];
    if (result.statementMd !== undefined) {
      setStatementMd(result.statementMd);
      if (result.title !== undefined) setTitle(result.title);
      clearErrors('title', 'statementMd');
      parts.push('đề bài');
    }
    if (result.constraints) {
      setConstraints(result.constraints);
      parts.push(`${String(result.constraints.length)} ràng buộc`);
    }
    if (hasTests) {
      setTests(mergeTests([], incomingTests));
      clearTestErrors();
      parts.push(`${String(incomingTests.length)} test`);
    }
    toast.show(`Đã nhập thư mục ${folder}: ${parts.join(', ')}.`);
    if (!hasStatement) {
      toast.warn(`Thư mục ${folder} không có file đề .md; đề bài hiện có được giữ nguyên.`);
    }
    if (!hasConstraints) {
      toast.warn(
        `Thư mục ${folder} không có file ràng buộc .json; ràng buộc hiện có được giữ nguyên.`,
      );
    }
    if (!hasTests) {
      toast.warn(`Thư mục ${folder} không có file test nào; test hiện có được giữ nguyên.`);
    }
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
      tests: tests.map(({ input, expectedOutput }) => ({ input, expectedOutput })),
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
          Chọn cùng lúc file đề (.md), file ràng buộc (.json) và các file test (NN.in, NN.out). Hoặc
          chọn cả thư mục bài bằng “Nhập thư mục”. Sau khi nhập vẫn sửa tay được.
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
          <Button
            onClick={() => {
              folderInput.current?.click();
            }}
          >
            Nhập thư mục
          </Button>
          <input
            ref={(element) => {
              folderInput.current = element;
              pickDirectory(element);
            }}
            className="lk-sr-only"
            type="file"
            multiple
            aria-label="Chọn thư mục bài"
            tabIndex={-1}
            onChange={(e) => void importFolder(e)}
          />
          <Link
            className="lk-btn lk-btn--secondary"
            to={`/ta/classes/${encodeURIComponent(classId)}`}
          >
            Huỷ
          </Link>
        </div>
        <p className="lk-page__note">
          Có thể nhập từng phần. Test trùng số sẽ được hỏi trước khi ghi đè. Nên nhập cả thư mục bài
          để tránh lẫn test của bài khác.
        </p>
        <p className="lk-page__note">
          Thư mục cần có 1 file đề .md, 1 file ràng buộc .json và các file test NN.in/NN.out (ở gốc
          hay trong tests/ đều được).
        </p>
      </header>

      {importWarnings.length > 0 ? (
        <section className="lk-panel" aria-labelledby="import-warnings-title">
          <h2 id="import-warnings-title" className="lk-panel__title">
            Cần xem lại sau khi nhập file
          </h2>
          <ul className="lk-list">
            {importWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
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
          const update = (next: Partial<FormTest>) => {
            setTests(replaceAt(tests, index, { ...test, ...next }));
          };
          return (
            <fieldset key={test.name} className="lk-fieldset">
              <legend>
                Test {index + 1} <span className="lk-mono">({test.name})</span>
              </legend>
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
              setTests([...tests, { name: nextTestName(tests), input: '', expectedOutput: '' }]);
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

      <ConfirmDialog
        key={question?.id}
        open={question !== undefined}
        title={question?.question.title ?? ''}
        body={question?.question.body}
        confirmLabel={question?.question.confirmLabel}
        alternativeLabel={question?.question.alternativeLabel}
        onAlternative={() => {
          answer('alternative');
        }}
        onConfirm={() => {
          answer('confirm');
        }}
        onCancel={() => {
          answer('cancel');
        }}
      />
    </form>
  );
}
