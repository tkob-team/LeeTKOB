import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { SubmitJudgePage } from './SubmitJudgePage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const labId = '00000000-0000-0000-0000-000000000001';
const id = '00000000-0000-0000-0000-000000000002';
const lab = { id: labId, title: 'Demo lab', latestSubmissionId: null };
const pollPath = `/labs/${labId}/submissions/${id}`;

describe('student submission and grading', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValueOnce([lab]);
  });

  it('rejects blank code and checks the limit in UTF-8 bytes', async () => {
    render(<SubmitJudgePage />);
    await screen.findByRole('option', { name: 'Demo lab' });
    const button = screen.getByRole('button', { name: 'Nộp bài' });
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
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('posts exactly 64 KB and polls through a queued receipt to ordered verdicts', async () => {
    request.mockResolvedValueOnce({ id });
    request.mockResolvedValueOnce({ status: 'queued', counted: true, tests: [] });
    request.mockResolvedValueOnce({
      status: 'completed',
      counted: true,
      verdict: 'WA',
      tests: [
        { number: 1, verdict: 'AC' },
        { number: 2, verdict: 'WA' },
      ],
    });
    render(<SubmitJudgePage />);
    await screen.findByRole('option', { name: 'Demo lab' });
    const code = 'é'.repeat(32_768);
    fireEvent.change(screen.getByLabelText('Mã nguồn C++17'), {
      target: { value: code },
    });
    const button = screen.getByRole('button', { name: 'Nộp bài' });
    fireEvent.click(button);
    // A10 (audit 2026-11-28): the id shows as its first 8 characters, the full id in `title`.
    expect(await screen.findByTitle(id)).toHaveTextContent(/^00000000$/);
    expect(screen.getByRole('status')).toHaveTextContent('Bài nộp đã vào hàng đợi.');
    const post = request.mock.calls.find(
      ([path, init]) => path === `/labs/${labId}/submissions` && init?.method === 'POST',
    );
    expect(post?.[1]?.body).toBe(JSON.stringify({ code }));
    expect(new Headers(post?.[1]?.headers).get('Idempotency-Key')).toMatch(/^[a-f0-9-]{36}$/);

    const table = await screen.findByRole(
      'table',
      { name: 'Kết quả từng test' },
      { timeout: 3000 },
    );
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
    expect(screen.getByText('Bài được tính điểm (lần nộp cuối trước hạn)')).toBeInTheDocument();
    expect(request.mock.calls.filter(([path]) => path === pollPath)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Nộp bài' })).toBeEnabled();
  });

  it('reuses the receipt key when a request with the same source is retried', async () => {
    request.mockRejectedValueOnce(
      new ApiProblemError({ type: 'about:blank', title: 'Mất kết nối', status: 0 }),
    );
    request.mockResolvedValueOnce({ id });
    request.mockResolvedValueOnce({ status: 'completed', counted: true, verdict: 'CE', tests: [] });
    render(<SubmitJudgePage />);
    await screen.findByRole('option', { name: 'Demo lab' });
    fireEvent.change(screen.getByLabelText('Mã nguồn C++17'), {
      target: { value: 'int main() {}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối');
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    expect(await screen.findByText('CE')).toBeInTheDocument();
    const postedKeys = request.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'));
    expect(postedKeys).toHaveLength(2);
    expect(postedKeys[0]).toMatch(/^[a-f0-9-]{36}$/);
    expect(postedKeys[1]).toBe(postedKeys[0]);
  });
});
