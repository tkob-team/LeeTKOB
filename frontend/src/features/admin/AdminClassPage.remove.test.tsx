import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { AuthContext, type AuthState } from '../../app/auth-context';
import type { AdminMember, TaAccount } from './admin-api';
import { AdminClassPage } from './AdminClassPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const classId = '1b2c3d4e-0000-4000-8000-000000000001';
const anna: TaAccount = { id: 'ta-anna', email: 'anna@x.vn', displayName: 'Anna' };
const binh: TaAccount = { id: 'ta-binh', email: 'binh@x.vn', displayName: 'Bình' };
const ta = (account: TaAccount): AdminMember => ({ ...account, role: 'TA' });
const an: AdminMember = { id: 'sv-an', role: 'STUDENT', email: 'an@x.vn', displayName: 'An' };
const chi: AdminMember = { id: 'sv-chi', role: 'STUDENT', email: 'chi@x.vn', displayName: 'Chi' };

const auth: AuthState = {
  session: { token: 't', role: 'admin', email: 'admin@x', displayName: 'Quản trị viên' },
  login: vi.fn(),
  logout: vi.fn(),
};

interface World {
  members: AdminMember[];
  tas: TaAccount[];
  /** Student ids that have submissions: DELETE answers 409 for them. */
  submitted?: string[];
}

function serve(world: World) {
  request.mockImplementation((path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET' && path === `/classes/${classId}`) {
      return Promise.resolve({ id: classId, name: 'Web', inviteCode: null });
    }
    if (method === 'GET' && path === `/admin/classes/${classId}/members`) {
      return Promise.resolve([...world.members]);
    }
    if (method === 'GET' && path === '/admin/tas') return Promise.resolve(world.tas);
    const removal = new RegExp(`^/admin/classes/${classId}/(tas|students)/(.+)$`).exec(path);
    if (method === 'DELETE' && removal) {
      const userId = removal[2] ?? '';
      if (world.submitted?.includes(userId)) {
        return Promise.reject(
          new ApiProblemError({
            type: 'urn:leetkob:problem:member-has-submissions',
            title: 'Student has submissions in this class',
            status: 409,
          }),
        );
      }
      world.members = world.members.filter((m) => m.id !== userId);
      return Promise.resolve(undefined);
    }
    return Promise.reject(new Error(`unexpected ${method} ${path}`));
  });
}

function renderPage() {
  render(
    <AuthContext value={auth}>
      <MemoryRouter initialEntries={[`/admin/classes/${classId}`]}>
        <Routes>
          <Route path="/admin/classes/:classId" element={<AdminClassPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext>,
  );
}

function deletes() {
  return request.mock.calls.filter(([, init]) => init?.method === 'DELETE');
}

describe('removing class members (admin)', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('asks in place, sends nothing on "Huỷ", and gives the focus back to "Gỡ"', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    serve({ members: [ta(anna)], tas: [anna, binh] });
    renderPage();
    const remove = await screen.findByRole('button', { name: 'Gỡ Anna' });
    fireEvent.click(remove);

    const confirm = screen.getByRole('button', { name: 'Xác nhận gỡ Anna?' });
    expect(confirm).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));

    expect(screen.queryByRole('button', { name: 'Xác nhận gỡ Anna?' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Gỡ Anna' })).toHaveFocus();
    expect(deletes()).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('removes a TA: "Đã gỡ <tên>.", list and picker updated, focus on the heading', async () => {
    serve({ members: [ta(anna)], tas: [anna, binh] });
    renderPage();
    await screen.findByRole('region', { name: 'Trợ giảng (1)' });
    expect(
      within(screen.getByRole('combobox', { name: 'Trợ giảng' }))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Chọn trợ giảng…', 'Bình — binh@x.vn']);

    fireEvent.click(screen.getByRole('button', { name: 'Gỡ Anna' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận gỡ Anna?' }));

    expect(await screen.findByText('Đã gỡ Anna.')).toHaveAttribute('role', 'status');
    const heading = await screen.findByRole('heading', { name: 'Trợ giảng (0)' });
    expect(heading).toHaveFocus();
    expect(deletes()[0]?.[0]).toBe(`/admin/classes/${classId}/tas/${anna.id}`);
    expect(screen.getByText('Lớp này chưa có trợ giảng.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('combobox', { name: 'Trợ giảng' }))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Chọn trợ giảng…', 'Anna — anna@x.vn', 'Bình — binh@x.vn']);
  });

  it('removes a student without submissions and focuses the students heading', async () => {
    serve({ members: [an, chi], tas: [] });
    renderPage();
    await screen.findByRole('region', { name: 'Sinh viên (2)' });
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ An' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận gỡ An?' }));

    expect(await screen.findByText('Đã gỡ An.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Sinh viên (1)' })).toHaveFocus();
    expect(deletes()[0]?.[0]).toBe(`/admin/classes/${classId}/students/${an.id}`);
    expect(screen.queryByRole('cell', { name: 'An' })).toBeNull();
    expect(screen.getByRole('cell', { name: 'Chi' })).toBeInTheDocument();
  });

  it('says a student with submissions cannot be removed (409) and keeps the row', async () => {
    serve({ members: [an], tas: [], submitted: [an.id] });
    renderPage();
    await screen.findByRole('region', { name: 'Sinh viên (1)' });
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ An' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận gỡ An?' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('An đã có bài nộp, chưa gỡ được.');
    expect(alert).not.toHaveTextContent(/Student has submissions|urn:/);
    expect(screen.getByRole('cell', { name: 'An' })).toBeInTheDocument();
    expect(screen.queryByText(/Đã gỡ/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Gỡ An' })).toHaveFocus();
  });

  it('shows another failure through the Vietnamese problem text', async () => {
    serve({ members: [ta(anna)], tas: [anna] });
    renderPage();
    await screen.findByRole('button', { name: 'Gỡ Anna' });
    request.mockRejectedValueOnce(
      new ApiProblemError({
        type: 'urn:leetkob:problem:class-not-found',
        title: 'Class not found',
        status: 404,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ Anna' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận gỡ Anna?' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không tìm thấy lớp');
    expect(alert).not.toHaveTextContent('Class not found');
  });
});
