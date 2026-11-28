/**
 * Reads a lab from files the TA picked, in the eval layout `eval/dev/problems/<id>/` or close
 * to it: the statement (`statement.md`, or the only `.md`), the constraints (`constraints.json`
 * `[{id, text, deduction}]`, or the only `.json`) and tests `NN.in` + `NN.out` at any depth.
 * `importLabFiles` takes loose files, `importLabFolder` one picked folder.
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

/** A picked file with the path shown in messages and its own name. */
interface Picked {
  file: ImportFile;
  /** Inside the picked folder ("tests/01.in") for a folder, else as the browser gives it. */
  path: string;
  name: string;
}

function picked(file: ImportFile, insideFolder: boolean): Picked {
  const full = file.webkitRelativePath || file.name;
  const parts = full.split(/[\\/]/);
  const name = parts[parts.length - 1] ?? full;
  const path = insideFolder && parts.length > 1 ? parts.slice(1).join('/') : full;
  return { file, path, name };
}

const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/**
 * The one file to read for the statement or the constraints: the file with the usual name
 * (`statement.md`, `constraints.json`), else the only file with that extension. Two or more
 * candidates are reported and none is read.
 */
function chooseOne(
  files: Picked[],
  usual: string,
  extension: string,
  what: string,
  warnings: string[],
): { chosen?: Picked; candidates: Picked[] } {
  const named = files.filter((p) => p.name === usual);
  const candidates =
    named.length > 0 ? named : files.filter((p) => p.name.toLowerCase().endsWith(extension));
  if (candidates.length === 1) return { chosen: candidates[0], candidates };
  if (candidates.length > 1) {
    const kind = named.length > 0 ? usual : extension;
    warnings.push(
      `Có ${String(candidates.length)} file ${kind} (${candidates.map((p) => p.path).join(', ')}), không biết file nào là ${what}; chưa nhập ${what}.`,
    );
  }
  return { candidates };
}

export async function importLabFiles(files: Iterable<ImportFile>): Promise<ImportResult> {
  return collect(Array.from(files, (file) => picked(file, false)));
}

/**
 * One picked folder (`<input webkitdirectory>`), read with the same rules as picked files:
 * tests `NN.in`/`NN.out` at any depth (the top, `tests/` or another subfolder), the statement
 * and constraints by name or as the only `.md`/`.json`. A kind the folder lacks is simply
 * absent from the result, so the form keeps what it has.
 */
export async function importLabFolder(files: Iterable<ImportFile>): Promise<ImportResult> {
  const list = Array.from(files);
  const first = list[0];
  const result = await collect(list.map((file) => picked(file, true)));
  if (first) result.folder = (first.webkitRelativePath || first.name).split(/[\\/]/)[0];
  return result;
}

async function collect(files: Picked[]): Promise<ImportResult> {
  const result: ImportResult = { notes: [], warnings: [] };
  const kindWarnings: string[] = [];
  const testWarnings: string[] = [];
  const used = new Set<Picked>();

  const inputs = new Map<string, Picked[]>();
  const outputs = new Map<string, Picked[]>();
  for (const p of files) {
    const test = TEST_FILE.exec(p.name);
    if (test?.[1] && (test[2] === 'in' || test[2] === 'out')) {
      const side = test[2] === 'in' ? inputs : outputs;
      side.set(test[1], [...(side.get(test[1]) ?? []), p]);
      used.add(p);
    }
  }

  const statement = chooseOne(files, 'statement.md', '.md', 'đề', kindWarnings);
  statement.candidates.forEach((p) => used.add(p));
  if (statement.chosen) {
    result.statementMd = await statement.chosen.file.text();
    result.title = titleOf(result.statementMd);
    result.notes.push(
      `${statement.chosen.path}: đã điền đề bài` + (result.title ? ' và tiêu đề.' : '.'),
    );
  }

  const constraints = chooseOne(files, 'constraints.json', '.json', 'ràng buộc', kindWarnings);
  constraints.candidates.forEach((p) => used.add(p));
  if (constraints.chosen) {
    const path = constraints.chosen.path;
    try {
      result.constraints = parseConstraints(await constraints.chosen.file.text());
      result.notes.push(`${path}: ${String(result.constraints.length)} ràng buộc.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'không đọc được.';
      kindWarnings.push(`${path}: ${reason}`);
    }
  }

  const stems = [...new Set([...inputs.keys(), ...outputs.keys()])].sort(byNumber);
  const tests: DraftTest[] = [];
  const testNames: string[] = [];
  for (const stem of stems) {
    const ins = inputs.get(stem) ?? [];
    const outs = outputs.get(stem) ?? [];
    const repeated = [ins, outs].find((side) => side.length > 1);
    if (repeated) {
      const file = repeated[0]?.name ?? stem;
      testWarnings.push(
        `Test ${stem}: ${file} có ở ${String(repeated.length)} nơi (${repeated.map((p) => p.path).join(', ')}), chưa nhập test này.`,
      );
      continue;
    }
    const input = ins[0];
    const output = outs[0];
    if (!input || !output) {
      testWarnings.push(
        `Test ${stem}: thiếu file ${input ? `${stem}.out` : `${stem}.in`}, đã bỏ qua.`,
      );
      continue;
    }
    tests.push({ input: await input.file.text(), expectedOutput: await output.file.text() });
    testNames.push(stem);
  }
  if (tests.length > 0) {
    result.tests = tests;
    result.testNames = testNames;
    result.notes.push(`tests: ${String(tests.length)} cặp input/output.`);
  }

  // Every file that is none of the three kinds, in one line.
  const skipped = files.filter((p) => !used.has(p)).map((p) => p.path);
  if (skipped.length > 0) {
    result.warnings.push(
      `Bỏ qua ${String(skipped.length)} file: ${skipped.join(', ')} (không phải đề, ràng buộc hay test).`,
    );
  }
  result.warnings.push(...kindWarnings, ...testWarnings);
  return result;
}
