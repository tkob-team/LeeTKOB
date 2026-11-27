import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { SubmitJudgePage } from './SubmitJudgePage';
import { verdictCaption } from './verdict-text';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const labId = '00000000-0000-4000-8000-000000000001';
const submissionId = '00000000-0000-4000-8000-000000000002';

type Report = { status: string; counted: boolean; verdict: string | null; tests: unknown[] };

/** The student already submitted, so the page polls the report right away. */
function renderWith(reports: Report[], cpuTimeMs = 2000) {
  const queue = [...reports];
  request.mockImplementation((path: string) => {
    if (path === '/student/labs') {
      return Promise.resolve([{ id: labId, title: 'Lab', latestSubmissionId: submissionId }]);
    }
    if (path === `/labs/${labId}`) return Promise.resolve({ id: labId, cpuTimeMs });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return Promise.resolve(next);
  });
  return render(<SubmitJudgePage />);
}

const done = (verdict: string, tests: unknown[] = []): Report => ({
  status: 'completed',
  counted: true,
  verdict,
  tests,
});

beforeEach(() => {
  request.mockReset();
});

describe('submit: waiting and verdict captions', () => {
  it('spins while queued and while grading, and stops at the verdict', async () => {
    const { container } = renderWith([
      { status: 'queued', counted: true, verdict: null, tests: [] },
      { status: 'grading', counted: true, verdict: null, tests: [] },
      done('AC', [{ number: 1, verdict: 'AC' }]),
    ]);
    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.lk-spinner')).not.toBeNull();

    expect(await screen.findByText('Đang chấm bài.', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(container.querySelector('.lk-spinner')).not.toBeNull();

    expect(await screen.findByText('Đúng tất cả test', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(container.querySelector('.lk-spinner')).toBeNull();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false');
  });

  it.each([
    ['AC', 'Đúng tất cả test'],
    ['WA', 'Sai kết quả ở ít nhất một test'],
    ['MLE', 'Vượt giới hạn bộ nhớ'],
    ['RE', 'Lỗi khi chạy (chương trình dừng bất thường)'],
    ['CE', 'Lỗi biên dịch'],
  ])('explains %s as "%s"', async (code, caption) => {
    renderWith([done(code)]);
    expect(await screen.findByText(caption)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(`Kết quả chung ${code}${caption}`);
    // Only TLE needs the lab's limits.
    expect(request.mock.calls.some(([path]) => path === `/labs/${labId}`)).toBe(false);
  });

  it('names the lab CPU limit for TLE', async () => {
    renderWith([done('TLE', [{ number: 1, verdict: 'TLE' }])], 2000);
    expect(await screen.findByText('Quá giới hạn thời gian CPU (2000 ms)')).toBeInTheDocument();
  });

  it('a CE with no tests still says it did not compile', async () => {
    renderWith([done('CE')]);
    expect(await screen.findByText('Lỗi biên dịch')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the spinner right after posting', async () => {
    request.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/student/labs') {
        return Promise.resolve([{ id: labId, title: 'Lab', latestSubmissionId: null }]);
      }
      if (init?.method === 'POST') return Promise.resolve({ id: submissionId });
      return new Promise(() => undefined);
    });
    const { container } = render(<SubmitJudgePage />);
    await screen.findByRole('option', { name: 'Lab' });
    fireEvent.change(screen.getByLabelText('Mã nguồn C++17'), {
      target: { value: 'int main() {}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    expect(await screen.findByText('Bài nộp đã vào hàng đợi.')).toBeInTheDocument();
    expect(container.querySelector('.lk-spinner')).not.toBeNull();
  });
});

describe('verdictCaption', () => {
  it('reads TLE without a number while the limit is unknown', () => {
    expect(verdictCaption('TLE')).toBe('Quá giới hạn thời gian CPU');
    expect(verdictCaption('TLE', 1500)).toBe('Quá giới hạn thời gian CPU (1500 ms)');
  });
});
