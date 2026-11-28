import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { AuthContext, type AuthState } from '../../app/auth-context';
import { ToastProvider } from '../../components/ui';
import { submittedLabel, type AdminMember } from './admin-api';
import { AdminClassPage } from './AdminClassPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const classId = '1b2c3d4e-0000-4000-8000-000000000001';
const auth: AuthState = {
  session: { token: 't', role: 'admin', email: 'admin@x', displayName: 'Quản trị viên' },
  login: vi.fn(),
  logout: vi.fn(),
};

const student = (
  id: string,
  name: string,
  submissionCount: number,
  submittedLabCount: number,
): AdminMember => ({
  id,
  role: 'STUDENT',
  email: `${id}@truong.edu.vn`,
  displayName: name,
  submissionCount,
  submittedLabCount,
});

function serve(members: AdminMember[]) {
  request.mockImplementation((path: string) => {
    if (path === `/classes/${classId}`) {
      return Promise.resolve({ id: classId, name: 'Web nâng cao', inviteCode: null });
    }
    if (path === `/admin/classes/${classId}/members`) return Promise.resolve(members);
    if (path === '/admin/tas') return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function renderPage() {
  render(
    <AuthContext value={auth}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/admin/classes/${classId}`]}>
          <Routes>
            <Route path="/admin/classes/:classId" element={<AdminClassPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext>,
  );
}

const HINT = 'Chọn sinh viên để gỡ nhiều người cùng lúc.';

function submittedCell(name: RegExp) {
  return within(screen.getByRole('row', { name })).getAllByRole('cell')[3];
}

describe('admin student roster: submissions and removal hints', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('shows "N lab · M lần" or "Chưa nộp" in the "Đã nộp" column', async () => {
    serve([student('sv-an', 'An', 14, 4), student('sv-binh', 'Bình', 0, 0)]);
    renderPage();
    const region = await screen.findByRole('region', { name: 'Sinh viên' });
    const headers = within(region)
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    expect(headers.slice(1, 4)).toEqual(['Tên', 'Email', 'Đã nộp']);
    expect(submittedCell(/An/)).toHaveTextContent(/^4 lab · 14 lần$/);
    expect(submittedCell(/Bình/)).toHaveTextContent(/^Chưa nộp$/);
  });

  it('says once under the heading who can be removed, not on every row', async () => {
    serve([student('sv-an', 'An', 3, 2), student('sv-chi', 'Chi', 5, 1)]);
    renderPage();
    const section = await screen.findByRole('region', { name: 'Sinh viên (2)' });
    expect(
      within(section).getByText('Chỉ gỡ được sinh viên chưa nộp bài trong lớp.'),
    ).toBeInTheDocument();
    expect(within(section).getByRole('table')).not.toHaveTextContent('Đã có bài nộp');
  });

  it('explains a locked "Gỡ" with a tooltip and its accessible description', async () => {
    serve([student('sv-an', 'An', 3, 2)]);
    renderPage();
    const button = await screen.findByRole('button', { name: 'Gỡ An' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Đã có bài nộp');
    expect(button.closest('[title]')).toHaveAttribute('title', 'Đã có bài nộp, không gỡ được.');
    expect(screen.getByRole('checkbox', { name: 'Chọn An' })).toHaveAccessibleDescription(
      'Đã có bài nộp',
    );
  });

  it('shows the hint in the fixed-height bar until a student is selected', async () => {
    serve([student('sv-an', 'An', 0, 0), student('sv-binh', 'Bình', 0, 0)]);
    renderPage();
    const hint = await screen.findByText(HINT);
    const bar = hint.parentElement as HTMLElement;
    expect(bar).toHaveClass('lk-bulkbar');
    const actions = within(bar).getByText('Đã chọn 0 sinh viên').parentElement as HTMLElement;
    expect(actions).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn An' }));
    expect(screen.queryByText(HINT)).toBeNull();
    expect(actions).not.toHaveAttribute('aria-hidden');
    expect(actions.parentElement).toBe(bar);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn' }));
    expect(screen.getByText(HINT).parentElement).toBe(bar);

    // The hint and the actions share one grid cell, so the bar keeps one height.
    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    expect(css).toMatch(/\.lk-bulkbar\s*>\s*\*\s*\{[^}]*grid-area:\s*1 \/ 1;/);
    expect(css).toMatch(/\.lk-bulkbar\s*\{[^}]*min-height:/);
  });

  it('labels submissions by labs and attempts', () => {
    expect(submittedLabel({ submissionCount: 0, submittedLabCount: 0 })).toBe('Chưa nộp');
    expect(submittedLabel({ submissionCount: 14, submittedLabCount: 4 })).toBe('4 lab · 14 lần');
    expect(submittedLabel({ submissionCount: 3 })).toBe('3 lần');
  });
});
