import { describe, expect, it } from 'vitest';
import { labPhase, labPhaseClass } from './lab-phase';

const opensAt = '2026-11-24T01:00:00.000Z';
const dueAt = '2026-12-01T17:00:00.000Z';
const at = (iso: string) => Date.parse(iso);

describe('labPhase (A8): one status for TA, student and review-queue screens', () => {
  it('is "Sắp mở" before the lab opens', () => {
    expect(labPhase(opensAt, dueAt, at('2026-11-24T00:59:59.000Z'))).toEqual({
      kind: 'upcoming',
      label: 'Sắp mở',
    });
  });

  it('is open from the opening instant, with the days left rounded up', () => {
    expect(labPhase(opensAt, dueAt, at(opensAt))).toEqual({
      kind: 'open',
      label: 'Đang mở · còn 8 ngày',
    });
    // 2 days and 1 hour left: "còn 3 ngày".
    expect(labPhase(opensAt, dueAt, at('2026-11-29T16:00:00.000Z')).label).toBe(
      'Đang mở · còn 3 ngày',
    );
    // Exactly 1 day left.
    expect(labPhase(opensAt, dueAt, at('2026-11-30T17:00:00.000Z')).label).toBe(
      'Đang mở · còn 1 ngày',
    );
  });

  it('says "còn dưới 1 ngày" in the last 24 hours', () => {
    expect(labPhase(opensAt, dueAt, at('2026-12-01T16:59:00.000Z'))).toEqual({
      kind: 'open',
      label: 'Đang mở · còn dưới 1 ngày',
    });
  });

  it('is "Hết hạn" from the deadline on', () => {
    expect(labPhase(opensAt, dueAt, at(dueAt))).toEqual({ kind: 'closed', label: 'Hết hạn' });
    expect(labPhase(opensAt, dueAt, at('2027-01-01T00:00:00.000Z')).kind).toBe('closed');
  });

  it('marks only an open lab with the brand tag; upcoming and closed are muted', () => {
    expect(labPhaseClass('open')).toBe('lk-tag');
    expect(labPhaseClass('upcoming')).toBe('lk-tag lk-tag--muted');
    expect(labPhaseClass('closed')).toBe('lk-tag lk-tag--muted');
  });
});
