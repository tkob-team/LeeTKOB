import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deductionLabel, evidenceLabel } from './deduction';
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
    expect(within(first).getByText('dòng 8').tagName).toBe('TD');
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
    const cell = within(row).getByText('0 (−4 nếu vi phạm)');
    expect(within(row).getAllByRole('cell')[2]).toBe(cell);
    expect(within(row).queryByText('−4')).not.toBeInTheDocument();
  });

  it('labels deductions by verdict', () => {
    expect(deductionLabel('violation', 3)).toBe('−3');
    expect(deductionLabel('unsure', 2.5)).toBe('−2.5');
    expect(deductionLabel('pass', 4)).toBe('0 (−4 nếu vi phạm)');
    expect(deductionLabel('pass', 2.5)).toBe('0 (−2.5 nếu vi phạm)');
  });

  it('labels evidence lines in words', () => {
    expect(evidenceLabel([11])).toBe('dòng 11');
    expect(evidenceLabel([9, 10])).toBe('dòng 9, 10');
    expect(evidenceLabel([])).toBe('—');
  });

  it('hides the submission column under a block header and names the table', () => {
    render(
      <ReviewQueueTable rows={rows} showSubmission={false} label="Ràng buộc của bài nộp s05" />,
    );
    const table = screen.getByRole('table', { name: 'Ràng buộc của bài nộp s05' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers).toEqual(['Ràng buộc', 'Khoản trừ', 'Nguồn', 'Kết luận', 'Bằng chứng']);
    expect(within(table).queryByText('s05')).not.toBeInTheDocument();
  });

  it('wraps the constraint text in full, renders inline code and never clips it', () => {
    const long =
      'C1 Do not call `std::sort`, `std::stable_sort` or `qsort` anywhere in the program.';
    const row0: ReviewQueueRow = {
      id: 'r1',
      submissionId: 's05',
      constraint: long,
      deduction: 3,
      source: 'hard rule',
      verdict: 'violation',
      evidenceLines: [8],
    };
    render(<ReviewQueueTable rows={[row0]} />);
    const [, row] = screen.getAllByRole('row');
    if (!row) throw new Error('expected a body row');
    const cell = within(row).getAllByRole('cell')[1];
    if (!cell) throw new Error('expected a constraint cell');
    expect(cell).toHaveClass('lk-wrap');
    expect(cell).not.toHaveClass('lk-table__clip');
    expect(cell).not.toHaveAttribute('title');
    expect(cell.textContent).toBe(
      'C1 Do not call std::sort, std::stable_sort or qsort anywhere in the program.',
    );
    expect(within(cell).getByText('std::sort').tagName).toBe('CODE');
    // Under jsdom import.meta.url is not a file URL; Vitest runs from frontend/.
    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    expect(css).not.toContain('lk-table__clip');
  });
});
