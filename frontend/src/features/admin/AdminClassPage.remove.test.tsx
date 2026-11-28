import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { AuthContext, type AuthState } from '../../app/auth-context';
import { ToastProvider } from '../../components/ui';
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
const ta = (account: TaAccount): AdminMember => ({ ...account, role: 'TA', submissionCount: 0 });
const student = (id: string, name: string, submissionCount = 0): AdminMember => ({
  id,
  role: 'STUDENT',
  email: `${id}@x.vn`,
  displayName: name,
  submissionCount,
});
const an = student('sv-an', 'An');
const chi = student('sv-chi', 'Chi');

const auth: AuthState = {
  session: { token: 't', role: 'admin', email: 'admin@x', displayName: 'Quản trị viên' },
  login: vi.fn(),
  logout: vi.fn(),
};

interface World {
  members: AdminMember[];
  tas: TaAccount[];
  /** Student ids whose DELETE answers 409, although the list says 0 (a submission just arrived). */
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

function deletes() {
  return request.mock.calls.filter(([, init]) => init?.method === 'DELETE');
}

function toasts() {
  return screen.getByRole('status', { name: 'Thông báo' });
}

/** Presses "Gỡ <tên>" in the page and returns the dialog it opens. */
function openRemoval(name: string) {
  const opener = screen.getByRole('button', { name: `Gỡ ${name}` });
  opener.focus();
  fireEvent.click(opener);
  return { opener, dialog: screen.getByRole('dialog') };
}

describe('removing class members (admin)', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('asks in a dialog with the TA consequence; "Huỷ" sends nothing and returns the focus', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    serve({ members: [ta(anna)], tas: [anna, binh] });
    renderPage();
    await screen.findByRole('button', { name: 'Gỡ Anna' });
    const { opener, dialog } = openRemoval('Anna');

    expect(dialog).toHaveAccessibleName('Gỡ Anna khỏi Web?');
    expect(dialog).toHaveAccessibleDescription(
      'Anna sẽ không còn xem được lab và hàng chờ duyệt của lớp này. Có thể gán lại sau.',
    );
    expect(within(dialog).getByRole('button', { name: 'Huỷ' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Gỡ Anna' })).toHaveClass('lk-btn--danger');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    expect(deletes()).toHaveLength(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('Esc cancels; only one dialog exists at a time and no confirm text enters the table', async () => {
    serve({ members: [ta(anna), an, chi], tas: [anna] });
    renderPage();
    await screen.findByRole('button', { name: 'Gỡ Anna' });
    const { dialog } = openRemoval('An');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const table = screen.getByRole('table');
    expect(within(table).queryByText(/Xác nhận/)).toBeNull();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deletes()).toHaveLength(0);
  });

  it('removes a TA: toast, list and picker updated, focus on the heading', async () => {
    serve({ members: [ta(anna)], tas: [anna, binh] });
    renderPage();
    await screen.findByRole('region', { name: 'Trợ giảng (1)' });
    const { dialog } = openRemoval('Anna');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gỡ Anna' }));

    expect(await within(toasts()).findByText('Đã gỡ Anna khỏi lớp.')).toBeInTheDocument();
    const heading = await screen.findByRole('heading', { name: 'Trợ giảng (0)' });
    expect(heading).toHaveFocus();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deletes()[0]?.[0]).toBe(`/admin/classes/${classId}/tas/${anna.id}`);
    expect(screen.getByText('Lớp này chưa có trợ giảng.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('combobox', { name: 'Gán thêm trợ giảng' }))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Chọn trợ giảng…', 'Anna — anna@x.vn', 'Bình — binh@x.vn']);
  });

  it('locks the dialog while the request runs: "Đang gỡ…", Esc does nothing', async () => {
    serve({ members: [an], tas: [] });
    renderPage();
    await screen.findByRole('button', { name: 'Gỡ An' });
    let finish: () => void = () => undefined;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => {
            resolve(undefined);
          };
        }),
    );
    const { dialog } = openRemoval('An');
    expect(dialog).toHaveAccessibleDescription(
      'An sẽ không còn thấy lab của lớp này. Chỉ gỡ được khi sinh viên chưa nộp bài nào trong lớp.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gỡ An' }));

    expect(within(dialog).getByRole('button', { name: 'Đang gỡ…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Huỷ' })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(await within(toasts()).findByText('Đã gỡ An khỏi lớp.')).toBeInTheDocument();
  });

  it('removes a student without submissions and focuses the students heading', async () => {
    serve({ members: [an, chi], tas: [] });
    renderPage();
    await screen.findByRole('region', { name: 'Sinh viên (2)' });
    const { dialog } = openRemoval('An');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gỡ An' }));

    expect(await within(toasts()).findByText('Đã gỡ An khỏi lớp.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Sinh viên (1)' })).toHaveFocus();
    expect(deletes()[0]?.[0]).toBe(`/admin/classes/${classId}/students/${an.id}`);
    expect(screen.queryByRole('cell', { name: 'An' })).toBeNull();
    expect(screen.getByRole('cell', { name: 'Chi' })).toBeInTheDocument();
  });

  it('locks "Gỡ" with "Đã có bài nộp" for a student who has submitted (B15)', async () => {
    serve({ members: [student('sv-dung', 'Dũng', 3)], tas: [] });
    renderPage();
    const button = await screen.findByRole('button', { name: 'Gỡ Dũng' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Đã có bài nộp');
    const row = screen.getByRole('row', { name: /Dũng/ });
    expect(within(row).getAllByRole('cell')[2]).toHaveTextContent(/^3$/);
  });

  it('keeps the dialog open on 409 with the reason and only "Đóng"', async () => {
    serve({ members: [an], tas: [], submitted: [an.id] });
    renderPage();
    await screen.findByRole('region', { name: 'Sinh viên (1)' });
    const { opener, dialog } = openRemoval('An');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gỡ An' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('An đã có bài nộp trong lớp nên chưa gỡ được.');
    expect(alert).not.toHaveTextContent(/Student has submissions|urn:/);
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Đóng']);
    expect(within(toasts()).queryByText(/Đã gỡ/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('cell', { name: 'An' })).toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('shows another failure inside the dialog in Vietnamese, with "Thử lại"', async () => {
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
    const { dialog } = openRemoval('Anna');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gỡ Anna' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Không tìm thấy lớp');
    expect(alert).not.toHaveTextContent('Class not found');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Thử lại' }));
    expect(await within(toasts()).findByText('Đã gỡ Anna khỏi lớp.')).toBeInTheDocument();
    expect(deletes()).toHaveLength(2);
  });
});
