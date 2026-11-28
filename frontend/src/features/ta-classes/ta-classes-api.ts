/** What the TA class screens read; members come from the TA roster, which has no names. */

/** One item of GET /classes/{classId}/members (classes.md): ids and roles only. */
export interface RosterEntry {
  id: string;
  role: 'TA' | 'STUDENT';
}

export function countRole(roster: RosterEntry[], role: RosterEntry['role']): number {
  return roster.filter((entry) => entry.role === role).length;
}

export const taClassPath = (id: string) => `/ta/classes/${encodeURIComponent(id)}`;
