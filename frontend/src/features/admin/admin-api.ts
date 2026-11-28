/** Types of docs/contract/classes.md 1.2.0 used by the admin screens. */

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
