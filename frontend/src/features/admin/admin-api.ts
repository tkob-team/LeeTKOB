/** Types of docs/contract/classes.md 1.4.0 used by the admin screens. */

/** One item of GET /admin/tas, and one TA of GET /admin/classes. */
export interface TaAccount {
  id: string;
  email: string | null;
  displayName: string | null;
}

/** One item of GET /admin/classes. */
export interface AdminClass {
  id: string;
  name: string;
  inviteCode: string | null;
  tas: TaAccount[];
  studentCount: number;
}

/** One item of GET /admin/classes/{classId}/members: TAs first, then by name. */
export interface AdminMember {
  id: string;
  role: 'TA' | 'STUDENT';
  email: string | null;
  displayName: string | null;
  /** Submissions of a student in the labs of this class (1.4.0); always 0 for a TA. */
  submissionCount: number;
  /**
   * Different labs of this class the student submitted to (1.5.0); always 0 for a TA. Missing
   * from a server older than 1.5.0, then only the number of submissions is shown.
   */
  submittedLabCount?: number;
}

/** The "Đã nộp" cell: "4 lab · 14 lần", or "Chưa nộp". */
export function submittedLabel(member: Pick<AdminMember, 'submissionCount' | 'submittedLabCount'>) {
  if (member.submissionCount === 0) return 'Chưa nộp';
  const times = `${String(member.submissionCount)} lần`;
  return member.submittedLabCount === undefined
    ? times
    : `${String(member.submittedLabCount)} lab · ${times}`;
}

/** Names are stripped and must contain 1–200 characters (classes.md). */
export const CLASS_NAME_MAX = 200;

/** Vietnamese message for a class name the server would refuse, or undefined when it is valid. */
export function classNameError(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Nhập tên lớp.';
  if (trimmed.length > CLASS_NAME_MAX) return `Tên lớp tối đa ${String(CLASS_NAME_MAX)} ký tự.`;
  return undefined;
}

/** A person's name: display name, else email, else id. */
export function personName(person: {
  id: string;
  email: string | null;
  displayName: string | null;
}) {
  return person.displayName ?? person.email ?? person.id;
}

/** "Tên — email" for the TA picker; just the name when one of the two is missing. */
export function taOptionLabel(account: TaAccount): string {
  const name = personName(account);
  return account.email && account.email !== name ? `${name} — ${account.email}` : name;
}

export const adminClassPath = (id: string) => `/admin/classes/${encodeURIComponent(id)}`;

/** Problem type of a removal refused because the student has submissions (classes.md 1.3.0). */
export const HAS_SUBMISSIONS = 'urn:leetkob:problem:member-has-submissions';

/** DELETE path that removes one member of a class (classes.md 1.3.0). */
export function removalPath(classId: string, member: AdminMember) {
  const kind = member.role === 'TA' ? 'tas' : 'students';
  return `/admin/classes/${encodeURIComponent(classId)}/${kind}/${encodeURIComponent(member.id)}`;
}

/**
 * Runs `task` on every item with at most `limit` running at once and resolves, in item order,
 * once all have settled; `onSettled` gets the number settled so far after each one.
 */
export async function runLimited<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
  onSettled?: (settled: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let settled = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T);
      settled += 1;
      onSettled?.(settled);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
