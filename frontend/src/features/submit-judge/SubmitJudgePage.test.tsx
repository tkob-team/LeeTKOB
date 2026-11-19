import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubmitJudgePage } from './SubmitJudgePage';

describe('student submission preview', () => {
  it('rejects blank code and checks the limit in UTF-8 bytes', () => {
    render(<SubmitJudgePage />);
    const button = screen.getByRole('button', { name: 'Nộp bài mẫu' });
    fireEvent.click(button);
    expect(screen.getByLabelText('Mã nguồn C++17')).toHaveAccessibleDescription(
      'Nhập mã nguồn C++17.',
    );

    fireEvent.change(screen.getByLabelText('Mã nguồn C++17'), {
      target: { value: 'é'.repeat(32_769) },
    });
    fireEvent.click(button);
    expect(screen.getByLabelText('Mã nguồn C++17')).toHaveAccessibleDescription(
      'Mã nguồn vượt quá 64 KB (65.536 byte UTF-8).',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('accepts exactly 64 KB and shows a receipt followed by ordered test verdicts', async () => {
    render(<SubmitJudgePage />);
    fireEvent.change(screen.getByLabelText('Mã nguồn C++17'), {
      target: { value: 'é'.repeat(32_768) },
    });
    const button = screen.getByRole('button', { name: 'Nộp bài mẫu' });
    fireEvent.click(button);
    expect(screen.getByRole('status')).toHaveTextContent('Bài nộp đã vào hàng đợi.');
    expect(screen.getByRole('button', { name: 'Nộp bài mẫu' })).toBeDisabled();

    const table = await screen.findByRole('table', { name: 'Verdict từng test' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      rows.map((row) => [
        within(row).getByRole('rowheader').textContent,
        within(row).getByRole('cell').textContent,
      ]),
    ).toEqual([
      ['1', 'AC'],
      ['2', 'WA'],
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Kết quả chung WA');
    expect(screen.getByRole('button', { name: 'Nộp bài mẫu' })).toBeEnabled();
  });
});
