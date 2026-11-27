import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { TaLayout } from '../../app/AppLayout';
import { AuthContext, type AuthState } from '../../app/auth-context';
import type { LabSummary } from './lab-api';
import { TaLabsPage } from './TaLabsPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const labId = '8f2d1c34-5e6a-4f7b-9c10-1a2b3c4d5e6f';
const classId = '1b2c3d4e-0000-4000-8000-000000000001';

const lab: LabSummary = {
  id: labId,
  title: 'Sorting with merge sort',
  opensAt: '2026-11-24T01:00:00.000Z',
  dueAt: '2026-12-01T16:59:59.000Z',
  cpuTimeMs: 1000,
  memoryMb: 256,
  testCount: 7,
  constraintCount: 2,
  submissionCount: 12,
  studentsSubmitted: 5,
};

describe('TA lab list', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('lists the labs of each class with a link to its review queue', async () => {
    request.mockResolvedValueOnce([{ id: classId, name: 'CTT1' }]).mockResolvedValueOnce([lab]);
    render(
      <MemoryRouter>
        <TaLabsPage />
      </MemoryRouter>,
    );

    const panel = await screen.findByRole('region', { name: 'CTT1' });
    const row = within(panel).getByRole('row', { name: /Sorting with merge sort/ });
    expect(row).toHaveTextContent('12 bài · 5 sinh viên');
    expect(
      within(row).getByRole('link', { name: 'Hàng chờ duyệt: Sorting with merge sort' }),
    ).toHaveAttribute('href', `/ta/labs/${labId}/review`);
    expect(within(panel).getByRole('link', { name: 'Tạo lab' })).toHaveAttribute(
      'href',
      `/ta/classes/${classId}/labs/new`,
    );
    expect(request).toHaveBeenCalledWith('/classes', expect.anything());
    expect(request).toHaveBeenCalledWith(`/classes/${classId}/labs`, expect.anything());
  });

  it.each([
    '/ta/labs',
    `/ta/classes/${classId}/labs/new`,
    `/ta/labs/${labId}/review`,
    '/ta/review-queue',
  ])('marks the navigation link "Lab" as the current page on %s', (path) => {
    const auth: AuthState = {
      session: { token: 't', role: 'ta', email: 'ta@x', displayName: 'TA' },
      login: vi.fn(),
      logout: vi.fn(),
    };
    render(
      <AuthContext value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <TaLayout />
        </MemoryRouter>
      </AuthContext>,
    );
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    const link = within(nav).getByRole('link', { name: 'Lab' });
    expect(link).toHaveAttribute('href', '/ta/labs');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('link', { name: 'Hàng chờ duyệt' })).toBeNull();
  });

  it('writes the lab title on each review-queue button, not only in its accessible name', async () => {
    request.mockResolvedValueOnce([{ id: classId, name: 'CTT1' }]).mockResolvedValueOnce([lab]);
    render(
      <MemoryRouter>
        <TaLabsPage />
      </MemoryRouter>,
    );
    const link = await screen.findByRole('link', {
      name: 'Hàng chờ duyệt: Sorting with merge sort',
    });
    expect(link).toHaveTextContent('Hàng chờ duyệt: Sorting with merge sort');
    expect(link).not.toHaveAttribute('aria-label');
  });

  it('wraps a long lab title (~120 characters) in its cell and in the queue button', async () => {
    const title =
      'Lab 7: sắp xếp trộn có đếm số lần đổi chỗ, đọc dữ liệu lớn từ bàn phím và in kết quả theo đúng định dạng đề yêu cầu';
    expect(title.length).toBeGreaterThanOrEqual(110);
    request
      .mockResolvedValueOnce([{ id: classId, name: 'CTT1' }])
      .mockResolvedValueOnce([{ ...lab, title }]);
    render(
      <MemoryRouter>
        <TaLabsPage />
      </MemoryRouter>,
    );
    const link = await screen.findByRole('link', { name: `Hàng chờ duyệt: ${title}` });
    const row = link.closest('tr');
    if (!row) throw new Error('expected a table row');
    const [titleCell] = within(row).getAllByRole('cell');
    expect(titleCell).toHaveTextContent(title);
    expect(titleCell).toHaveClass('lk-wrap');
    expect(link.closest('td')).toHaveClass('lk-wrap');

    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    expect(css).toMatch(
      /\.lk-table td\.lk-wrap \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/,
    );
    expect(css).toMatch(/\.lk-table td\.lk-wrap \.lk-btn \{[^}]*white-space: normal;/);
  });
});
