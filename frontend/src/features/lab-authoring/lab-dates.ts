/** Lab dates as typed in the create-lab form (`datetime-local`, viewer's time zone). */

/** `datetime-local` value (viewer's time zone) to RFC 3339 UTC, or '' when empty/invalid. */
export function toIso(local: string): string {
  if (!local) return '';
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export type DateField = 'opensAt' | 'dueAt';
export type DateErrors = Partial<Record<DateField, string>>;

/**
 * Both dates are required and Hạn nộp must come after Mở lúc (lab-authoring contract). An order
 * mistake is reported under both fields, since either one may be the wrong value.
 */
export function dateErrors(opensAt: string, dueAt: string): DateErrors {
  const errors: DateErrors = {};
  const opens = toIso(opensAt);
  const due = toIso(dueAt);
  if (!opens) errors.opensAt = 'Chọn thời điểm mở lab.';
  if (!due) errors.dueAt = 'Chọn hạn nộp.';
  if (opens && due && Date.parse(due) <= Date.parse(opens)) {
    errors.opensAt = 'Mở lúc phải trước Hạn nộp.';
    errors.dueAt = 'Hạn nộp phải sau Mở lúc.';
  }
  return errors;
}
