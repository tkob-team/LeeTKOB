/** Client check of the create-lab form, run before anything is sent (lab-authoring contract). */
import { fieldErrorMessage } from '../../api/problem-message';
import { dateErrors } from './lab-dates';

export interface LabFormValues {
  title: string;
  statementMd: string;
  /** `datetime-local` values. */
  opensAt: string;
  dueAt: string;
  cpuTimeMs: string;
  memoryMb: string;
  tests: { input: string; expectedOutput: string }[];
}

export const TITLE_MAX = 200;

function isIntegerIn(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  const n = Number(value);
  return n >= min && n <= max;
}

/**
 * Every required field at once, keyed by the API field path and in the order the fields appear
 * on the page, so the first key is the field to focus. Messages match the server's field rules
 * (problem-message.ts).
 */
export function labFormErrors(values: LabFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = values.title.trim();
  if (title.length === 0 || title.length > TITLE_MAX) errors.title = fieldErrorMessage('title');
  if (values.statementMd.trim().length === 0) errors.statementMd = fieldErrorMessage('statementMd');
  Object.assign(errors, dateErrors(values.opensAt, values.dueAt));
  if (!isIntegerIn(values.cpuTimeMs, 1000, 5000)) errors.cpuTimeMs = fieldErrorMessage('cpuTimeMs');
  if (!isIntegerIn(values.memoryMb, 64, 512)) errors.memoryMb = fieldErrorMessage('memoryMb');
  values.tests.forEach((test, index) => {
    if (test.expectedOutput.length === 0) {
      errors[`tests[${String(index)}].expectedOutput`] = 'Nhập đầu ra mong đợi.';
    }
  });
  return errors;
}

/** "Còn 1 trường cần sửa." under the submit button; empty when nothing is wrong. */
export function errorSummary(count: number): string {
  return count > 0 ? `Còn ${String(count)} trường cần sửa.` : '';
}
