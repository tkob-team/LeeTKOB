/** Types of docs/contract/lab-authoring.md and display helpers shared by the lab screens. */

export interface LabConstraint {
  code: string;
  text: string;
  deduction: number;
}

export interface LabTest {
  ordinal: number;
  input: string;
  expectedOutput: string;
}

/** GET /labs/{labId}; `tests` is present in the TA view only. */
export interface LabDetail {
  id: string;
  classId: string;
  title: string | null;
  statementMd: string;
  opensAt: string;
  dueAt: string;
  cpuTimeMs: number;
  wallTimeMs: number;
  memoryMb: number;
  constraints: LabConstraint[];
  tests?: LabTest[];
}

/** One item of GET /classes/{classId}/labs. */
export interface LabSummary {
  id: string;
  title: string | null;
  opensAt: string;
  dueAt: string;
  cpuTimeMs: number;
  memoryMb: number;
  testCount: number;
  constraintCount: number;
  submissionCount: number;
  studentsSubmitted: number;
}

/** One item of GET /classes (classes.md); inviteCode is null or absent for students. */
export interface Classroom {
  id: string;
  name: string;
  inviteCode?: string | null;
}

/** POST /classes/{classId}/labs body. */
export interface NewLab {
  title: string;
  statementMd: string;
  opensAt: string;
  dueAt: string;
  cpuTimeMs: number;
  memoryMb: number;
  tests: { input: string; expectedOutput: string }[];
  constraints: LabConstraint[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `dd/MM/yyyy HH:mm` in the viewer's time zone (design system); the API sends UTC. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Deduction with a minus sign, as the design system writes it: "−3", "−4.5". */
export function formatDeduction(value: number): string {
  return `−${String(Number(value.toFixed(2)))}`;
}

export function labTitle(title: string | null): string {
  return title ?? 'Lab chưa đặt tên';
}
