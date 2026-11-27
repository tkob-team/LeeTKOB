import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { formatDateTime } from '../lab-authoring/lab-api';
import { StudentLabPage, StudentLabsPage } from './StudentLabPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const labId = '8f2d1c34-5e6a-4f7b-9c10-1a2b3c4d5e6f';

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/student/labs" element={<StudentLabsPage />} />
        <Route path="/student/labs/:labId" element={<StudentLabPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('student lab statement', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('shows the statement, limits and deductions, and links to the submit page', async () => {
    request.mockResolvedValueOnce({
      id: labId,
      classId: 'c',
      title: 'Sorting with merge sort',
      statementMd: '# Sorting with merge sort\n\nRead `n` integers.',
      opensAt: '2026-11-24T01:00:00.000Z',
      dueAt: '2026-12-01T16:59:59.000Z',
      cpuTimeMs: 1000,
      wallTimeMs: 3000,
      memoryMb: 256,
      constraints: [
        { code: 'C1', text: 'Do not call a library sort function.', deduction: 3 },
        { code: 'C2', text: 'Sort with a merge sort you wrote yourself.', deduction: 4.5 },
      ],
    });
    renderAt(`/student/labs/${labId}`);

    expect(
      await screen.findByRole('heading', { name: 'Sorting with merge sort', level: 1 }),
    ).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(`/labs/${labId}`, expect.anything());
    const paragraph = screen.getByText(
      (_, element) => element?.tagName === 'P' && element.textContent === 'Read n integers.',
    );
    expect(within(paragraph).getByText('n').tagName).toBe('CODE');
    expect(screen.getByText(/thời gian thực 3000 ms/)).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: /C1 Do not call a library sort function\. −3/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /C2 .* −4\.5/ })).toBeInTheDocument();
    expect(screen.queryByText(/Input|Output/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đi tới trang nộp bài' })).toHaveAttribute(
      'href',
      `/student/submit?lab=${labId}`,
    );
  });

  it('renders the statement as Markdown with a copy button per code block', async () => {
    request.mockResolvedValueOnce({
      id: labId,
      classId: 'c',
      title: 'Sorting',
      statementMd: [
        '# Sorting',
        '',
        '## Example',
        '',
        '```',
        '6',
        '5 -2 9',
        '```',
        '',
        '<script>window.x=1</script>',
      ].join('\n'),
      opensAt: '2026-11-24T01:00:00.000Z',
      dueAt: '2026-12-01T16:59:59.000Z',
      cpuTimeMs: 1000,
      wallTimeMs: 3000,
      memoryMb: 256,
      constraints: [{ code: 'C1', text: 'Do not call `std::sort` or `qsort`.', deduction: 3 }],
    });
    renderAt(`/student/labs/${labId}`);

    const statement = await screen.findByRole('region', { name: 'Đề bài' });
    expect(within(statement).getByRole('heading', { level: 2, name: 'Sorting' })).toBeVisible();
    expect(within(statement).getByRole('heading', { level: 3, name: 'Example' })).toBeVisible();
    expect(within(statement).getByRole('button', { name: 'Sao chép' })).toBeVisible();
    expect(statement.querySelector('script')).toBeNull();
    expect(statement.textContent).not.toContain('```');

    const table = screen.getByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers).toEqual(['ID', 'Chi tiết ràng buộc', 'Khoản trừ']);
    const row = within(table).getByRole('row', { name: 'C1 Do not call std::sort or qsort. −3' });
    expect(within(row).getByText('std::sort').tagName).toBe('CODE');
    expect(row.textContent).not.toContain('`');
  });

  it('explains that a lab is not open yet', async () => {
    request.mockRejectedValueOnce(
      new ApiProblemError({
        type: 'urn:leetkob:problem:lab-not-open',
        title: 'Lab is not open yet',
        status: 409,
      }),
    );
    renderAt(`/student/labs/${labId}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Lab chưa mở');
  });

  it('lists the labs of the student with links to their statements', async () => {
    request.mockResolvedValueOnce([{ id: labId, title: 'Sorting', latestSubmissionId: null }]);
    renderAt('/student/labs');
    expect(await screen.findByRole('link', { name: 'Sorting' })).toHaveAttribute(
      'href',
      `/student/labs/${labId}`,
    );
  });

  it('lists labs as a table: name, deadline and the status of the counted submission', async () => {
    const lab = (overrides: object) => ({
      id: labId,
      title: 'Sorting',
      opensAt: '2026-11-24T01:00:00.000Z',
      dueAt: '2026-12-01T16:59:00.000Z',
      latestSubmissionId: null,
      latestVerdict: null,
      ...overrides,
    });
    request.mockResolvedValueOnce([
      lab({
        id: 'a',
        title: 'Future lab',
        opensAt: '2099-01-02T03:04:00.000Z',
        dueAt: '2099-01-09T03:04:00.000Z',
      }),
      lab({ id: 'b', title: 'Not submitted' }),
      lab({ id: 'c', title: 'Grading', latestSubmissionId: 's1' }),
      lab({ id: 'd', title: 'Accepted', latestSubmissionId: 's2', latestVerdict: 'AC' }),
      lab({ id: 'e', title: 'Wrong', latestSubmissionId: 's3', latestVerdict: 'WA' }),
    ]);
    renderAt('/student/labs');

    const table = await screen.findByRole('table', { name: 'Danh sách lab' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers).toEqual(['Lab', 'Hạn nộp', 'Trạng thái']);
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(rows).toEqual([
      [
        'Future lab',
        formatDateTime('2099-01-09T03:04:00.000Z'),
        `Chưa mở (mở lúc ${formatDateTime('2099-01-02T03:04:00.000Z')})`,
      ],
      ['Not submitted', formatDateTime('2026-12-01T16:59:00.000Z'), 'Chưa nộp'],
      ['Grading', formatDateTime('2026-12-01T16:59:00.000Z'), 'Đang chấm'],
      ['Accepted', formatDateTime('2026-12-01T16:59:00.000Z'), 'Bài được tính: AC'],
      ['Wrong', formatDateTime('2026-12-01T16:59:00.000Z'), 'Bài được tính: WA'],
    ]);
    expect(within(table).getByText('AC')).toHaveClass('lk-judge', 'lk-judge--ac');
    expect(within(table).getByText('WA')).toHaveClass('lk-judge', 'lk-judge--fail');
    expect(within(table).getByRole('link', { name: 'Accepted' })).toHaveAttribute(
      'href',
      '/student/labs/d',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('shows a dash for the deadline when an older backend omits it', async () => {
    request.mockResolvedValueOnce([{ id: labId, title: 'Sorting', latestSubmissionId: null }]);
    renderAt('/student/labs');
    const table = await screen.findByRole('table', { name: 'Danh sách lab' });
    const [, row] = within(table).getAllByRole('row');
    if (!row) throw new Error('expected a body row');
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Sorting', '—', 'Chưa nộp']);
  });

  it('keeps the empty state when the student has no lab', async () => {
    request.mockResolvedValueOnce([]);
    renderAt('/student/labs');
    expect(await screen.findByText('Lớp của bạn chưa có lab nào.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('wraps a long lab title (~120 characters) in the list and on the statement page', async () => {
    const title =
      'Lab 7: sắp xếp trộn có đếm số lần đổi chỗ, đọc dữ liệu lớn từ bàn phím và in kết quả theo đúng định dạng đề yêu cầu';
    request.mockResolvedValueOnce([{ id: labId, title, latestSubmissionId: null }]);
    renderAt('/student/labs');
    const link = await screen.findByRole('link', { name: title });
    expect(link.closest('td')).toHaveClass('lk-wrap');

    const css = readFileSync(join(process.cwd(), 'src/app/shell.css'), 'utf8');
    expect(css).toMatch(/\.lk-page__title \{[^}]*overflow-wrap: anywhere;/);
  });
});
