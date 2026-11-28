/** Types of docs/contract/classes.md 1.1.0 used by the admin screens. */

/** One item of GET /admin/tas. */
export interface TaAccount {
  id: string;
  email: string | null;
}

/** One item of GET /classes/{classId}/members. */
export interface ClassMember {
  id: string;
  role: 'TA' | 'STUDENT';
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

/** What the TA dropdown shows for an account; accounts without an email show their id. */
export function taLabel(account: TaAccount): string {
  return account.email ?? account.id;
}
