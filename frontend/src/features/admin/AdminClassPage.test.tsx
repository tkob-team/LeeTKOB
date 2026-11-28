import { fireEvent, render, screen, within } from '@testing-library/react';
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
const code = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';
const anna: TaAccount = {
  id: 'ta-anna',
  email: 'anna.ta@truong.edu.vn',
  displayName: 'Anna Trợ giảng',
};
const binh: TaAccount = {
  id: 'ta-binh',
  email: 'binh.ta@truong.edu.vn',
  displayName: 'Bình Trợ giảng',
};
const cuong: TaAccount = { id: 'ta-cuong', email: 'cuong.ta@truong.edu.vn', displayName: null };

const asMember = (ta: TaAccount): AdminMember => ({ ...ta, role: 'TA', submissionCount: 0 });
const studentAn: AdminMember = {
  id: 'sv-an',
  role: 'STUDENT',
  email: 'an@truong.edu.vn',
  displayName: 'An',
  submissionCount: 0,
};
const studentChi: AdminMember = {
  id: 'sv-chi',
  role: 'STUDENT',
  email: 'chi@truong.edu.vn',
  displayName: 'Chi',
  submissionCount: 2,
  submittedLabCount: 1,
};

const auth: AuthState = {
  session: { token: 't', role: 'admin', email: 'admin@x', displayName: 'Quản trị viên' },
  login: vi.fn(),
  logout: vi.fn(),
};

interface World {
  members: AdminMember[];
  tas: TaAccount[];
  classStatus?: number;
}

/** A fake backend for one class: POST …/tas adds the TA to `members`. */
function serve(world: World) {
  request.mockImplementation((path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET' && path === `/classes/${classId}`) {
      if (world.classStatus === 404) {
        return Promise.reject(
          new ApiProblemError({
            type: 'urn:leetkob:problem:class-not-found',
            title: 'Class not found',
            status: 404,
          }),
        );
      }
      return Promise.resolve({ id: classId, name: 'Web nâng cao', inviteCode: code });
    }
    if (method === 'GET' && path === `/admin/classes/${classId}/members`) {
      if (world.classStatus === 404) {
        return Promise.reject(
          new ApiProblemError({
            type: 'urn:leetkob:problem:class-not-found',
            title: 'Class not found',
            status: 404,
          }),
        );
      }
      return Promise.resolve([...world.members]);
    }
    if (method === 'GET' && path === '/admin/tas') return Promise.resolve(world.tas);
    if (method === 'POST' && path === `/classes/${classId}/tas`) {
      const { userId } = JSON.parse(init?.body as string) as { userId: string };
      const ta = world.tas.find((t) => t.id === userId);
      if (ta) world.members = [asMember(ta), ...world.members];
      return Promise.resolve(undefined);
    }
    return Promise.reject(new Error(`unexpected ${method} ${path}`));
  });
}

function renderPage(id = classId) {
  render(
    <AuthContext value={auth}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/admin/classes/${id}`]}>
          <Routes>
            <Route path="/admin/classes/:classId" element={<AdminClassPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext>,
  );
}

function picker() {
  return screen.getByRole('combobox', { name: 'Gán thêm trợ giảng' });
}

function optionLabels() {
  return within(picker())
    .getAllByRole('option')
    .map((o) => o.textContent);
}

describe('admin class page', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('shows the name, the invite code with a copy button and a link back to the list', async () => {
    serve({ members: [], tas: [] });
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Web nâng cao', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Lớp học' })).toHaveAttribute(
      'href',
      '/admin/classes',
    );
    expect(screen.getByText(code)).toHaveClass('lk-mono');
    expect(
      screen.getByRole('button', { name: 'Sao chép mã mời lớp Web nâng cao' }),
    ).toBeInTheDocument();
  });

  it('lists the TAs with name and email, and students in a table', async () => {
    serve({ members: [asMember(anna), studentAn, studentChi], tas: [anna, binh] });
    renderPage();
    const tas = await screen.findByRole('region', { name: 'Trợ giảng (1)' });
    expect(
      within(tas)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Anna Trợ giảnganna.ta@truong.edu.vnGỡ']);
    const students = screen.getByRole('region', { name: 'Sinh viên (2)' });
    const rows = within(students).getAllByRole('row').slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ),
    ).toEqual([
      ['', 'An', 'an@truong.edu.vn', 'Chưa nộp', 'Gỡ'],
      ['', 'Chi', 'chi@truong.edu.vn', '1 lab · 2 lần', 'Gỡ'],
    ]);
  });

  it('says how students get in when the class has none', async () => {
    serve({ members: [asMember(anna)], tas: [anna] });
    renderPage();
    const students = await screen.findByRole('region', { name: 'Sinh viên (0)' });
    expect(students).toHaveTextContent('Chưa có sinh viên. Gửi mã mời để sinh viên tự vào lớp.');
    expect(within(students).queryByRole('table')).toBeNull();
  });

  it('offers only TAs not yet in the class, as "Tên — email"', async () => {
    serve({ members: [asMember(anna)], tas: [anna, binh, cuong] });
    renderPage();
    await screen.findByRole('region', { name: 'Trợ giảng (1)' });
    expect(optionLabels()).toEqual([
      'Chọn trợ giảng…',
      'Bình Trợ giảng — binh.ta@truong.edu.vn',
      'cuong.ta@truong.edu.vn',
    ]);
  });

  it('assigns a TA: "Đã gán <tên>.", list updated, TA leaves the picker, focus on picker', async () => {
    const world: World = { members: [asMember(anna)], tas: [anna, binh, cuong] };
    serve(world);
    renderPage();
    await screen.findByRole('region', { name: 'Trợ giảng (1)' });
    const gan = screen.getByRole('button', { name: 'Gán' });
    expect(gan).toBeEnabled();
    expect(gan.parentElement).toHaveClass('lk-assign');
    fireEvent.click(gan);
    expect(picker()).toHaveAccessibleDescription('Chọn một trợ giảng.');
    expect(picker()).toHaveAttribute('aria-invalid', 'true');
    expect(picker()).toHaveFocus();
    expect(request).not.toHaveBeenCalledWith(`/classes/${classId}/tas`, expect.anything());

    fireEvent.change(picker(), { target: { value: binh.id } });
    expect(screen.getByRole('button', { name: 'Gán' })).toBe(gan);
    expect(picker()).not.toHaveAttribute('aria-invalid');
    fireEvent.click(gan);

    const toasts = screen.getByRole('status', { name: 'Thông báo' });
    expect(await within(toasts).findByText('Đã gán Bình Trợ giảng.')).toBeInTheDocument();
    const tas = await screen.findByRole('region', { name: 'Trợ giảng (2)' });
    expect(within(tas).getByText('Bình Trợ giảng')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(`/classes/${classId}/tas`, {
      method: 'POST',
      body: JSON.stringify({ userId: binh.id }),
    });
    expect(optionLabels()).toEqual(['Chọn trợ giảng…', 'cuong.ta@truong.edu.vn']);
    expect(picker()).toHaveValue('');
    expect(picker()).toHaveFocus();
  });

  it('replaces the form once every TA is in the class', async () => {
    const world: World = { members: [asMember(anna)], tas: [anna, binh] };
    serve(world);
    renderPage();
    await screen.findByRole('region', { name: 'Trợ giảng (1)' });
    fireEvent.change(picker(), { target: { value: binh.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Gán' }));

    expect(await screen.findByText('Đã gán Bình Trợ giảng.')).toBeInTheDocument();
    expect(await screen.findByText('Mọi trợ giảng đã được gán cho lớp này.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gán' })).toBeNull();
  });

  it('shows the sentence instead of the form when all TAs are already assigned', async () => {
    serve({ members: [asMember(anna), asMember(binh)], tas: [anna, binh] });
    renderPage();
    const tas = await screen.findByRole('region', { name: 'Trợ giảng (2)' });
    expect(within(tas).getByText('Mọi trợ giảng đã được gán cho lớp này.')).toBeInTheDocument();
    expect(within(tas).queryByRole('combobox')).toBeNull();
  });

  it('shows the 404 page for an unknown class', async () => {
    serve({ members: [], tas: [], classStatus: 404 });
    renderPage();
    expect(await screen.findByText('Không tìm thấy lớp')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về danh sách lớp' })).toHaveAttribute(
      'href',
      '/admin/classes',
    );
    expect(screen.queryByText('Class not found')).toBeNull();
  });

  it('names the tab after the class', async () => {
    serve({ members: [], tas: [] });
    renderPage();
    await screen.findByRole('heading', { name: 'Web nâng cao', level: 1 });
    expect(document.title).toBe('Web nâng cao · LeeTKOB');
  });

  it('says the class does not exist or was deleted, under a tab named after it', async () => {
    serve({ members: [], tas: [], classStatus: 404 });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy lớp' })).toBeInTheDocument();
    expect(screen.getByText('Lớp không tồn tại hoặc đã bị xoá.')).toBeInTheDocument();
    expect(screen.queryByText('Không tìm thấy trang')).toBeNull();
    expect(document.title).toBe('Không tìm thấy lớp · LeeTKOB');
  });

  it('shows the 404 page for an id that is not a UUID (400)', async () => {
    request.mockRejectedValue(
      new ApiProblemError({
        type: 'urn:leetkob:problem:invalid-request',
        title: 'Invalid request',
        status: 400,
      }),
    );
    renderPage('not-a-uuid');
    expect(await screen.findByText('Không tìm thấy lớp')).toBeInTheDocument();
  });

  it('shows an assignment error in Vietnamese', async () => {
    serve({ members: [], tas: [anna] });
    renderPage();
    await screen.findByRole('region', { name: 'Trợ giảng (0)' });
    request.mockRejectedValueOnce(
      new ApiProblemError({
        type: 'urn:leetkob:problem:invalid-request',
        title: 'Invalid request',
        status: 400,
        detail: 'Only an existing TA account can be assigned.',
      }),
    );
    fireEvent.change(picker(), { target: { value: anna.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Gán' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Dữ liệu chưa hợp lệ');
    expect(alert).not.toHaveTextContent(/Invalid request|Only an existing/);
    expect(screen.queryByText(/Đã gán/)).toBeNull();
  });
});
