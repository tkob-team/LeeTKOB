/**
 * Reads the eval layout `eval/dev/problems/<id>/` from files the TA picked:
 * `statement.md`, `constraints.json` (`[{id, text, deduction}]`) and `tests/NN.in` + `NN.out`.
 * Only the file name matters, so the files may be picked from one folder or several.
 */

export interface DraftTest {
  input: string;
  expectedOutput: string;
}

export interface DraftConstraint {
  code: string;
  text: string;
  /** Kept as text so the TA can edit it; validated on submit. */
  deduction: string;
}

export interface ImportResult {
  title?: string;
  statementMd?: string;
  constraints?: DraftConstraint[];
  tests?: DraftTest[];
  /** Files that were read and what they filled, in Vietnamese. */
  notes: string[];
  /** Problems that need the TA's attention, in Vietnamese. */
  warnings: string[];
}

/** The part of `File` the importer needs; real `File` objects satisfy it. */
export interface ImportFile {
  name: string;
  webkitRelativePath?: string;
  text(): Promise<string>;
}

const TEST_FILE = /^(.+)\.(in|out)$/;

function baseName(file: ImportFile): string {
  const path = file.webkitRelativePath || file.name;
  return path.split(/[\\/]/).pop() ?? path;
}

/** First `# ` heading of a Markdown statement, used as the lab title. */
export function titleOf(markdown: string): string | undefined {
  const heading = /^#\s+(.+?)\s*#*\s*$/m.exec(markdown);
  return heading?.[1]?.trim() || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses constraints.json; accepts `id` (eval layout) or `code` (API) for the code. */
export function parseConstraints(text: string): DraftConstraint[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('constraints.json phải là một mảng.');
  return parsed.map((item: unknown, index) => {
    if (!isRecord(item)) throw new Error(`Ràng buộc thứ ${String(index + 1)} không phải object.`);
    const code = item.code ?? item.id;
    const { text: body, deduction } = item;
    if (typeof code !== 'string' || typeof body !== 'string' || typeof deduction !== 'number') {
      throw new Error(`Ràng buộc thứ ${String(index + 1)} cần id, text và deduction (số).`);
    }
    return { code, text: body, deduction: String(deduction) };
  });
}

export async function importLabFiles(files: Iterable<ImportFile>): Promise<ImportResult> {
  const result: ImportResult = { notes: [], warnings: [] };
  const inputs = new Map<string, ImportFile>();
  const outputs = new Map<string, ImportFile>();

  for (const file of files) {
    const name = baseName(file);
    if (name === 'statement.md') {
      result.statementMd = await file.text();
      result.title = titleOf(result.statementMd);
      result.notes.push('statement.md: đã điền đề bài' + (result.title ? ' và tiêu đề.' : '.'));
      continue;
    }
    if (name === 'constraints.json') {
      try {
        result.constraints = parseConstraints(await file.text());
        result.notes.push(`constraints.json: ${String(result.constraints.length)} ràng buộc.`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'không đọc được.';
        result.warnings.push(`constraints.json: ${reason}`);
      }
      continue;
    }
    const test = TEST_FILE.exec(name);
    if (test?.[1] && test[2]) {
      (test[2] === 'in' ? inputs : outputs).set(test[1], file);
      continue;
    }
    result.warnings.push(
      `Bỏ qua ${name}: không thuộc bố cục statement.md, constraints.json, tests/NN.in, NN.out.`,
    );
  }

  const stems = [...new Set([...inputs.keys(), ...outputs.keys()])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const tests: DraftTest[] = [];
  for (const stem of stems) {
    const input = inputs.get(stem);
    const output = outputs.get(stem);
    if (!input || !output) {
      result.warnings.push(
        `Test ${stem}: thiếu file ${input ? `${stem}.out` : `${stem}.in`}, đã bỏ qua.`,
      );
      continue;
    }
    tests.push({ input: await input.text(), expectedOutput: await output.text() });
  }
  if (tests.length > 0) {
    result.tests = tests;
    result.notes.push(`tests: ${String(tests.length)} cặp input/output.`);
  }
  return result;
}
