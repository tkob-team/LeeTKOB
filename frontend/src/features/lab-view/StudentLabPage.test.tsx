import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
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
      '/student/submit',
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
});
