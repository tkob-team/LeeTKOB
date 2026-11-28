import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabSummary } from './lab-api';
import { LabTable } from './LabTable';

const base: LabSummary = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  title: 'Sorting with merge sort',
  opensAt: '2026-11-24T01:00:00.000Z',
  dueAt: '2026-12-01T17:00:00.000Z',
  cpuTimeMs: 1000,
  memoryMb: 256,
  testCount: 7,
  constraintCount: 2,
  submissionCount: 12,
  studentsSubmitted: 5,
};

const labs: LabSummary[] = [
  {
    ...base,
    id: 'aaaaaaaa-0000-4000-8000-000000000003',
    title: 'Graphs',
    opensAt: '2026-12-05T01:00:00.000Z',
    dueAt: '2026-12-12T17:00:00.000Z',
  },
  base,
  {
    ...base,
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    title: 'Loops',
    opensAt: '2026-11-01T01:00:00.000Z',
    dueAt: '2026-11-08T17:00:00.000Z',
  },
];

function renderTable(list = labs) {
  render(
    <MemoryRouter>
      <LabTable labs={list} />
    </MemoryRouter>,
  );
}

const rowOf = (title: string) => {
  const row = screen.getByRole('link', { name: title }).closest('tr');
  if (!row) throw new Error(`no row for ${title}`);
  return row;
};

describe('TA lab table (A8)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-28T17:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes the lab title the link to its review queue', () => {
    renderTable();
    expect(screen.getByRole('link', { name: 'Sorting with merge sort' })).toHaveAttribute(
      'href',
      `/ta/labs/${base.id}/review`,
    );
  });

  it('labels the row button "Hàng chờ" and names the lab in its accessible name', () => {
    renderTable();
    const button = within(rowOf('Sorting with merge sort')).getByRole('link', {
      name: 'Hàng chờ duyệt: Sorting with merge sort',
    });
    expect(button).toHaveTextContent(/^Hàng chờ$/);
    expect(button).toHaveClass('lk-btn', 'lk-btn--secondary');
    expect(button).toHaveAttribute('href', `/ta/labs/${base.id}/review`);
  });

  it('shows each lab phase in a "Trạng thái" column, from labPhase()', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Trạng thái' })).toBeInTheDocument();
    const open = within(rowOf('Sorting with merge sort')).getByText('Đang mở · còn 3 ngày');
    expect(open).toHaveClass('lk-tag');
    expect(open).not.toHaveClass('lk-tag--muted');
    expect(within(rowOf('Graphs')).getByText('Sắp mở')).toHaveClass('lk-tag--muted');
    expect(within(rowOf('Loops')).getByText('Hết hạn')).toHaveClass('lk-tag--muted');
  });

  it('scrolls inside a focusable, named region that may shrink below the table width', () => {
    renderTable();
    const frame = screen.getByRole('region', { name: 'Danh sách lab của lớp' });
    expect(frame).toHaveAttribute('tabindex', '0');
    expect(frame).toHaveClass('lk-table-wrap', 'lk-table-frame');
    expect(within(frame).getByRole('table')).toBeInTheDocument();
  });

  it('keeps the page from scrolling sideways at 375 px (stylesheet)', () => {
    // jsdom has no layout: check the rules that let the grid columns shrink to 0.
    const css = readFileSync(join(process.cwd(), 'src/app/shell.css'), 'utf8');
    expect(css).toMatch(
      /\.lk-section:has\(\.lk-table-frame\),\s*\.lk-panel:has\(> \.lk-table-frame\) \{\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(css).toMatch(/\.lk-table-frame \{\s*min-width: 0;\s*max-width: 100%;/);
  });

  it('says when the class has no lab', () => {
    renderTable([]);
    expect(screen.getByText('Lớp này chưa có lab.')).toBeInTheDocument();
    expect(screen.queryByRole('region')).toBeNull();
  });
});
