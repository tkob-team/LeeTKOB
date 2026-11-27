import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { SubmitJudgePage } from './SubmitJudgePage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const first = {
  id: '00000000-0000-0000-0000-00000000000a',
  title: 'First lab',
  latestSubmissionId: null,
};
const second = {
  id: '00000000-0000-0000-0000-00000000000b',
  title: 'Second lab',
  latestSubmissionId: '00000000-0000-0000-0000-0000000000c1',
};

describe('submit page: preselected lab, result emphasis, shared width', () => {
  beforeEach(() => {
    request.mockReset();
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('preselects the lab named in ?lab= and shows its counted result with a large badge', async () => {
    window.history.replaceState({}, '', `/student/submit?lab=${second.id}`);
    request.mockResolvedValueOnce([first, second]);
    request.mockResolvedValueOnce({
      status: 'completed',
      counted: true,
      verdict: 'AC',
      tests: [{ number: 1, verdict: 'AC' }],
    });
    render(<SubmitJudgePage />);

    // The status first says "queued" until the poll answers; wait for the final result.
    const table = await screen.findByRole('table', { name: 'Kết quả từng test' });
    const status = screen.getByRole('status');
    expect(screen.getByRole('combobox', { name: 'Lab' })).toHaveValue(second.id);
    expect(request).toHaveBeenCalledWith(
      `/labs/${second.id}/submissions/${second.latestSubmissionId}`,
      expect.anything(),
    );
    expect(status).toHaveTextContent('Kết quả chung AC');
    expect(within(status).getByText('AC')).toHaveClass('lk-judge', 'lk-judge--large');
    expect(screen.getByText('Bài được tính điểm (lần nộp cuối trước hạn)')).toBeInTheDocument();
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers).toEqual(['Test', 'Kết quả']);
    expect(within(table).getByText('AC')).not.toHaveClass('lk-judge--large');
    expect(screen.queryByText(/Verdict/i)).not.toBeInTheDocument();
  });

  // UI-3: an unknown ?lab= no longer falls back to the first lab (SubmitJudgePage.unknown-lab).
  it('keeps the old behaviour without ?lab=: the first lab', async () => {
    window.history.replaceState({}, '', '/student/submit');
    request.mockResolvedValueOnce([first, second]);
    render(<SubmitJudgePage />);

    await screen.findByRole('option', { name: 'First lab' });
    expect(screen.getByRole('combobox', { name: 'Lab' })).toHaveValue(first.id);
  });

  it('says "Chưa nộp bài nào" when the selected lab has no submission', async () => {
    request.mockResolvedValueOnce([first]);
    render(<SubmitJudgePage />);

    const result = await screen.findByRole('region', { name: 'Kết quả chấm' });
    expect(within(result).getByText('Chưa nộp bài nào.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('puts the code field and the result table in one container with one width', async () => {
    request.mockResolvedValueOnce([second]);
    request.mockResolvedValueOnce({
      status: 'completed',
      counted: true,
      verdict: 'WA',
      tests: [{ number: 1, verdict: 'WA' }],
    });
    const { container } = render(<SubmitJudgePage />);

    const table = await screen.findByRole('table', { name: 'Kết quả từng test' });
    const page = container.querySelector('.lk-submit');
    expect(page).not.toBeNull();
    expect(page?.contains(screen.getByLabelText('Mã nguồn C++17'))).toBe(true);
    expect(page?.contains(table)).toBe(true);
    // Under jsdom import.meta.url is not a file URL; Vitest runs from frontend/.
    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    const field = /\.lk-submit \.lk-field \{([^}]*)\}/.exec(css)?.[1] ?? '';
    const area = /\.lk-submit \.lk-field textarea \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(field).toContain('max-width: none;');
    expect(area).toContain('width: 100%;');
  });
});
