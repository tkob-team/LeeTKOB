/** Where a lab is in time, from its opening and due dates (computed on the client). */

export type LabPhaseKind = 'upcoming' | 'open' | 'closed';

export interface LabPhase {
  kind: LabPhaseKind;
  /** "Sắp mở", "Đang mở · còn N ngày" or "Hết hạn". */
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Before `opensAt`: "Sắp mở"; from `opensAt` until `dueAt`: "Đang mở" with the days left
 * (rounded up, "còn dưới 1 ngày" in the last 24 hours); from `dueAt` on: "Hết hạn". One function
 * for the TA lab table, the review queue header and the student pages.
 */
export function labPhase(opensAt: string, dueAt: string, now: number = Date.now()): LabPhase {
  if (now < Date.parse(opensAt)) return { kind: 'upcoming', label: 'Sắp mở' };
  const left = Date.parse(dueAt) - now;
  if (left <= 0) return { kind: 'closed', label: 'Hết hạn' };
  const days = Math.ceil(left / DAY_MS);
  return {
    kind: 'open',
    label: left < DAY_MS ? 'Đang mở · còn dưới 1 ngày' : `Đang mở · còn ${String(days)} ngày`,
  };
}

/** `lk-tag` for an open lab (brand), the muted tag otherwise. */
export function labPhaseClass(kind: LabPhaseKind): string {
  return kind === 'open' ? 'lk-tag' : 'lk-tag lk-tag--muted';
}
