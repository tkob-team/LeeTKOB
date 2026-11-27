import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deductionLabel } from './deduction';
import { ReviewQueueTable, type ReviewQueueRow } from './ReviewQueueTable';

const rows: ReviewQueueRow[] = [
  {
    id: 'r1',
    submissionId: 's05',
    constraint: 'C1 No library sort',
    deduction: 3,
    source: 'hard rule',
    verdict: 'violation',
    evidenceLines: [8],
  },
  {
    id: 'r2',
    submissionId: 's05',
    constraint: 'C2 Own merge sort',
    deduction: 4,
    source: 'model',
    verdict: 'unsure',
    evidenceLines: [],
  },
];

describe('ReviewQueueTable', () => {
  it('renders rows with a minus-sign deduction, verdict badge and evidence lines', () => {
    render(<ReviewQueueTable rows={rows} />);
    const table = screen.getByRole('table');
    expect(table).toHaveClass('lk-table');
    expect(table.parentElement).toHaveClass('lk-table-wrap');
    const [, first, second] = screen.getAllByRole('row');
    if (!first || !second) throw new Error('expected two body rows');
    expect(within(first).getByText('−3')).toBeInTheDocument();
    expect(within(first).getByText('violation')).toBeInTheDocument();
    expect(within(first).getByText('8')).toHaveClass('lk-mono');
    expect(within(second).getByText('—')).toBeInTheDocument();
  });

  it('selects a row by click and by keyboard', () => {
    const onSelect = vi.fn();
    render(<ReviewQueueTable rows={rows} selectedId="r1" onSelect={onSelect} />);
    const [, first, second] = screen.getAllByRole('row');
    if (!first || !second) throw new Error('expected two body rows');
    expect(first).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(first);
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(onSelect).toHaveBeenNthCalledWith(1, rows[0]);
    expect(onSelect).toHaveBeenNthCalledWith(2, rows[1]);
  });

  it('shows a pass row as no deduction, with what a violation would cost', () => {
    const pass: ReviewQueueRow = {
      id: 'r3',
      submissionId: 's06',
      constraint: 'C2 Own merge sort',
      deduction: 4,
      source: 'model',
      verdict: 'pass',
      evidenceLines: [],
    };
    render(<ReviewQueueTable rows={[pass]} />);
    const [, row] = screen.getAllByRole('row');
    if (!row) throw new Error('expected a body row');
    const cell = within(row).getByText('Không trừ (mức trừ nếu vi phạm: 4)');
    expect(cell).toHaveClass('lk-wrap');
    expect(within(row).queryByText('−4')).not.toBeInTheDocument();
  });

  it('labels deductions by verdict', () => {
    expect(deductionLabel('violation', 3)).toBe('−3');
    expect(deductionLabel('unsure', 2.5)).toBe('−2.5');
    expect(deductionLabel('pass', 4)).toBe('Không trừ (mức trừ nếu vi phạm: 4)');
  });

  it('clips the constraint cell so the other columns stay in view', () => {
    render(<ReviewQueueTable rows={rows} />);
    const cell = screen.getByText('C1 No library sort');
    expect(cell.tagName).toBe('TD');
    expect(cell).toHaveClass('lk-table__clip');
    expect(cell).toHaveAttribute('title', 'C1 No library sort');
    // Under jsdom import.meta.url is not a file URL; Vitest runs from frontend/.
    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    const rule = /\.lk-table td\.lk-table__clip \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('max-width: 0;');
    expect(rule).toContain('width: 100%;');
    expect(rule).toContain('overflow: hidden;');
    expect(rule).toContain('text-overflow: ellipsis;');
  });
});
