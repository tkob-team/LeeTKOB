import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
});
