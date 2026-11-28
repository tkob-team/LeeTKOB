/**
 * Reads the eval layout `eval/dev/problems/<id>/` from files the TA picked:
 * `statement.md`, `constraints.json` (`[{id, text, deduction}]`) and `tests/NN.in` + `NN.out`.
 * `importLabFiles` looks only at the file name, so files may come from one folder or several;
 * `importLabFolder` reads one picked folder by relative path and reports anything else.
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
  /** The number (file stem, "01") of each entry of `tests`, in the same order. */
  testNames?: string[];
  /** `importLabFolder` only: the name of the picked folder. */
  folder?: string;
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

/** Where a picked file goes; `skip` carries the name to report. */
type Role =
  | { kind: 'statement' }
  | { kind: 'constraints' }
  | { kind: 'test'; stem: string; ext: 'in' | 'out' }
  | { kind: 'skip'; name: string };

const LAYOUT = 'statement.md, constraints.json, tests/NN.in, NN.out';

/** By file name only: any `NN.in`/`NN.out`, wherever it sits. */
function roleByName(file: ImportFile): Role {
  const name = baseName(file);
  if (name === 'statement.md') return { kind: 'statement' };
  if (name === 'constraints.json') return { kind: 'constraints' };
  const test = TEST_FILE.exec(name);
  if (test?.[1] && (test[2] === 'in' || test[2] === 'out')) {
    return { kind: 'test', stem: test[1], ext: test[2] };
  }
  return { kind: 'skip', name };
}

export async function importLabFiles(files: Iterable<ImportFile>): Promise<ImportResult> {
  return collect(Array.from(files, (file) => ({ file, role: roleByName(file) })));
}

/**
 * One picked folder (`<input webkitdirectory>`): `statement.md` and `constraints.json` at its
 * top, tests in its `tests/` folder; every other file is reported, not read.
 */
export async function importLabFolder(files: Iterable<ImportFile>): Promise<ImportResult> {
  const list = Array.from(files);
  const first = list[0];
  const folder = first ? (first.webkitRelativePath || first.name).split(/[\\/]/)[0] : undefined;
  const entries = list.map((file) => {
    const parts = (file.webkitRelativePath || file.name).split(/[\\/]/);
    const inside = parts.slice(1).join('/');
    const test = /^tests\/([^/]+)\.(in|out)$/.exec(inside);
    let role: Role;
    if (inside === 'statement.md') role = { kind: 'statement' };
    else if (inside === 'constraints.json') role = { kind: 'constraints' };
    else if (test?.[1] && (test[2] === 'in' || test[2] === 'out')) {
      role = { kind: 'test', stem: test[1], ext: test[2] };
    } else role = { kind: 'skip', name: inside || file.name };
    return { file, role };
  });
  const result = await collect(entries);
  result.folder = folder;
  if (folder !== undefined) {
    if (result.statementMd === undefined) {
      result.warnings.push(`Thư mục ${folder} không có statement.md.`);
    }
    if (!entries.some((e) => e.role.kind === 'constraints')) {
      result.warnings.push(`Thư mục ${folder} không có constraints.json.`);
    }
    if (!result.tests)
      result.warnings.push(`Thư mục ${folder} không có cặp test nào trong tests/.`);
  }
  return result;
}

async function collect(entries: { file: ImportFile; role: Role }[]): Promise<ImportResult> {
  const result: ImportResult = { notes: [], warnings: [] };
  const inputs = new Map<string, ImportFile>();
  const outputs = new Map<string, ImportFile>();

  for (const { file, role } of entries) {
    if (role.kind === 'statement') {
      result.statementMd = await file.text();
      result.title = titleOf(result.statementMd);
      result.notes.push('statement.md: đã điền đề bài' + (result.title ? ' và tiêu đề.' : '.'));
      continue;
    }
    if (role.kind === 'constraints') {
      try {
        result.constraints = parseConstraints(await file.text());
        result.notes.push(`constraints.json: ${String(result.constraints.length)} ràng buộc.`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'không đọc được.';
        result.warnings.push(`constraints.json: ${reason}`);
      }
      continue;
    }
    if (role.kind === 'test') {
      const side = role.ext === 'in' ? inputs : outputs;
      if (side.has(role.stem)) {
        result.warnings.push(
          `Test ${role.stem}: có hơn một file ${role.stem}.${role.ext}, đã dùng file chọn sau.`,
        );
      }
      side.set(role.stem, file);
      continue;
    }
    result.warnings.push(`Bỏ qua ${role.name}: không thuộc bố cục ${LAYOUT}.`);
  }

  const stems = [...new Set([...inputs.keys(), ...outputs.keys()])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const tests: DraftTest[] = [];
  const testNames: string[] = [];
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
    testNames.push(stem);
  }
  if (tests.length > 0) {
    result.tests = tests;
    result.testNames = testNames;
    result.notes.push(`tests: ${String(tests.length)} cặp input/output.`);
  }
  return result;
}
