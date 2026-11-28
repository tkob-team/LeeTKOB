import type { DraftConstraint, DraftTest } from './lab-import';

/** A test on the form, with its number: the file stem it came from ("01") or the next free one. */
export interface FormTest extends DraftTest {
  name: string;
}

const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** A test with neither input nor output, such as the empty one a new form starts with. */
export function isBlank(test: DraftTest): boolean {
  return test.input === '' && test.expectedOutput === '';
}

/** The next number after the highest one on the form, two digits at least ("03"). */
export function nextTestName(tests: FormTest[]): string {
  const numbers = tests.map((t) => Number(t.name)).filter((n) => Number.isInteger(n));
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return String(next).padStart(2, '0');
}

/**
 * Names in number order, with runs of at least `minRun` consecutive numbers written as a range:
 * ["01".."05"] → "01–05"; ["06", "07"] → "06, 07" (or "06–07" with `minRun` 2).
 */
export function formatNames(names: string[], minRun = 3): string {
  const sorted = [...names].sort(byNumber);
  const parts: string[] = [];
  let start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    const prev = sorted[i - 1] ?? '';
    const current = sorted[i];
    const consecutive =
      current !== undefined &&
      /^\d+$/.test(prev) &&
      /^\d+$/.test(current) &&
      Number(current) === Number(prev) + 1;
    if (consecutive) continue;
    const run = sorted.slice(start, i);
    if (run.length >= minRun) parts.push(`${run[0] ?? ''}–${run[run.length - 1] ?? ''}`);
    else parts.push(...run);
    start = i;
  }
  return parts.join(', ');
}

export interface TestPlan {
  /** Numbers not on the form yet: added without asking. */
  added: FormTest[];
  /** Numbers on the form with different content: overwriting them needs a confirmation. */
  conflicts: string[];
  /** Numbers on the form with the same input and output: nothing to do. */
  same: string[];
  /** Non-blank tests on the form whose number the import does not have: always kept. */
  kept: string[];
}

/** Compares the imported tests with the form by number; blank tests on the form do not count. */
export function planTests(current: FormTest[], incoming: FormTest[]): TestPlan {
  const existing = new Map(current.filter((t) => !isBlank(t)).map((t) => [t.name, t]));
  const plan: TestPlan = { added: [], conflicts: [], same: [], kept: [] };
  for (const test of incoming) {
    const old = existing.get(test.name);
    if (!old) plan.added.push(test);
    else if (old.input === test.input && old.expectedOutput === test.expectedOutput) {
      plan.same.push(test.name);
    } else plan.conflicts.push(test.name);
  }
  const incomingNames = new Set(incoming.map((t) => t.name));
  plan.kept = [...existing.keys()].filter((name) => !incomingNames.has(name)).sort(byNumber);
  return plan;
}

/** The form's non-blank tests with the imported ones added or written over, in number order. */
export function mergeTests(current: FormTest[], incoming: FormTest[]): FormTest[] {
  const merged = new Map(current.filter((t) => !isBlank(t)).map((t) => [t.name, t]));
  for (const test of incoming) merged.set(test.name, test);
  return [...merged.values()].sort((a, b) => byNumber(a.name, b.name));
}

export function sameConstraints(a: DraftConstraint[], b: DraftConstraint[]): boolean {
  return (
    a.length === b.length &&
    a.every((c, i) => {
      const other = b[i];
      return (
        other !== undefined &&
        c.code === other.code &&
        c.text === other.text &&
        Number(c.deduction) === Number(other.deduction)
      );
    })
  );
}
