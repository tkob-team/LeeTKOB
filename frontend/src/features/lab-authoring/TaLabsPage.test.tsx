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

    const panel = await screen.findByRole('region', { name: 'Lớp CTT1' });
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

  it('points the navigation link "Hàng chờ duyệt" at the lab list', () => {
    const auth: AuthState = {
      session: { token: 't', role: 'ta', email: 'ta@x', displayName: 'TA' },
      login: vi.fn(),
      logout: vi.fn(),
    };
    render(
      <AuthContext value={auth}>
        <MemoryRouter>
          <TaLayout />
        </MemoryRouter>
      </AuthContext>,
    );
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(within(nav).getByRole('link', { name: 'Hàng chờ duyệt' })).toHaveAttribute(
      'href',
      '/ta/labs',
    );
  });
});
