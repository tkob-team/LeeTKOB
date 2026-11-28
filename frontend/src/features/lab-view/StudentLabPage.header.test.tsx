import { render, screen } from '@testing-library/react';
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
const detail = {
  id: labId,
  classId: 'c',
  title: 'Sorting with merge sort',
  statementMd: '# Sorting',
  opensAt: '2026-11-24T01:00:00.000Z',
  dueAt: '2026-12-01T16:59:00.000Z',
  cpuTimeMs: 1000,
  wallTimeMs: 3000,
  memoryMb: 256,
  constraints: [],
};

function serve(studentLabs: unknown[] | Error) {
  request.mockImplementation((path: string) => {
    if (path === `/labs/${labId}`) return Promise.resolve(detail);
    if (path === '/student/labs') {
      return studentLabs instanceof Error
        ? Promise.reject(studentLabs)
        : Promise.resolve(studentLabs);
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

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

describe('student statement header (A15)', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('links back to "Đề bài" and puts "Nộp bài" next to the title', async () => {
    serve([]);
    renderAt(`/student/labs/${labId}`);
    await screen.findByRole('heading', { name: 'Sorting with merge sort', level: 1 });
    expect(screen.getByRole('link', { name: '← Đề bài' })).toHaveAttribute('href', '/student/labs');
    const submit = screen.getByRole('link', { name: 'Nộp bài' });
    expect(submit).toHaveClass('lk-btn', 'lk-btn--primary');
    expect(submit).toHaveAttribute('href', `/student/submit?lab=${labId}`);
    expect(submit.closest('.lk-title-row')).toBe(
      screen.getByRole('heading', { level: 1 }).closest('.lk-title-row'),
    );
    // The button at the end of a long statement stays.
    expect(screen.getByRole('link', { name: 'Đi tới trang nộp bài' })).toBeInTheDocument();
  });

  it('shows the counted verdict next to the deadline', async () => {
    serve([
      {
        id: labId,
        title: 'Sorting with merge sort',
        latestSubmissionId: 's1',
        opensAt: detail.opensAt,
        dueAt: detail.dueAt,
        latestVerdict: 'AC',
      },
    ]);
    renderAt(`/student/labs/${labId}`);
    const line = await screen.findByText(/Bài được tính:/);
    expect(line).toHaveTextContent(`Bài được tính: AC · Hạn nộp ${formatDateTime(detail.dueAt)}`);
  });

  it('says "Chưa nộp" before the first submission', async () => {
    serve([
      {
        id: labId,
        title: 'Sorting',
        latestSubmissionId: null,
        opensAt: detail.opensAt,
        dueAt: detail.dueAt,
      },
    ]);
    renderAt(`/student/labs/${labId}`);
    expect(await screen.findByText(/^Chưa nộp · Hạn nộp/)).toBeInTheDocument();
  });

  it('still shows the statement and deadline when the status cannot be read', async () => {
    serve(
      new ApiProblemError({ type: 'urn:leetkob:problem:internal-error', title: 'x', status: 500 }),
    );
    renderAt(`/student/labs/${labId}`);
    expect(
      await screen.findByText(
        `Hạn nộp ${formatDateTime(detail.dueAt)} · Mở ${formatDateTime(detail.opensAt)}`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('titles the tab with the lab name (A11)', async () => {
    serve([]);
    renderAt(`/student/labs/${labId}`);
    await screen.findByRole('heading', { name: 'Sorting with merge sort', level: 1 });
    expect(document.title).toBe('Sorting with merge sort · LeeTKOB');
  });

  it('keeps the way back while loading and on an error', async () => {
    request.mockRejectedValue(
      new ApiProblemError({ type: 'urn:leetkob:problem:lab-not-found', title: 'x', status: 404 }),
    );
    renderAt(`/student/labs/${labId}`);
    await screen.findByRole('alert');
    expect(screen.getByRole('link', { name: '← Đề bài' })).toBeInTheDocument();
  });
});
