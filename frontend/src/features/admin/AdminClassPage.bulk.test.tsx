import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { AuthContext, type AuthState } from '../../app/auth-context';
import { ToastProvider } from '../../components/ui';
import { runLimited, type AdminMember } from './admin-api';
import { AdminClassPage } from './AdminClassPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const classId = '1b2c3d4e-0000-4000-8000-000000000001';
const student = (n: number, submissionCount = 0): AdminMember => ({
  id: `sv-${String(n).padStart(2, '0')}`,
  role: 'STUDENT',
  email: null,
  displayName: `SV ${String(n).padStart(2, '0')}`,
  submissionCount,
});

const auth: AuthState = {
  session: { token: 't', role: 'admin', email: 'admin@x', displayName: 'Quản trị viên' },
  login: vi.fn(),
  logout: vi.fn(),
};

interface World {
  members: AdminMember[];
  /** DELETE answers 409 for these ids. */
  conflict?: string[];
  /** DELETE answers 404 class-not-found for these ids. */
  broken?: string[];
  /** DELETE waits for `release()` when set. */
  hold?: boolean;
}

function serve(world: World) {
  const waiting: (() => void)[] = [];
  let running = 0;
  let maxRunning = 0;
  request.mockImplementation((path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET' && path === `/classes/${classId}`) {
      return Promise.resolve({ id: classId, name: 'Web', inviteCode: null });
    }
    if (method === 'GET' && path === `/admin/classes/${classId}/members`) {
      return Promise.resolve([...world.members]);
    }
    if (method === 'GET' && path === '/admin/tas') return Promise.resolve([]);
    const removal = new RegExp(`^/admin/classes/${classId}/students/(.+)$`).exec(path);
    if (method === 'DELETE' && removal) {
      const id = removal[1] ?? '';
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      const settle = () => {
        running -= 1;
        if (world.conflict?.includes(id)) {
          throw new ApiProblemError({
            type: 'urn:leetkob:problem:member-has-submissions',
            title: 'Student has submissions in this class',
            status: 409,
          });
        }
        if (world.broken?.includes(id)) {
          throw new ApiProblemError({
            type: 'urn:leetkob:problem:class-not-found',
            title: 'Class not found',
            status: 404,
          });
        }
        world.members = world.members.filter((m) => m.id !== id);
        return undefined;
      };
      if (!world.hold) return Promise.resolve().then(settle);
      return new Promise((resolve, reject) => {
        waiting.push(() => {
          try {
            settle();
            resolve(undefined);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      });
    }
    return Promise.reject(new Error(`unexpected ${method} ${path}`));
  });
  return {
    release: () => {
      waiting.splice(0).forEach((go) => {
        go();
      });
    },
    maxRunning: () => maxRunning,
    waiting: () => waiting.length,
  };
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

function bar() {
  return screen.getByText(/^Đã chọn \d+ sinh viên$/).parentElement as HTMLElement;
}

describe('bulk removal of students (admin, B1)', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('select all selects every removable row, indeterminate on a partial selection', async () => {
    serve({ members: [student(1), student(2), student(3, 2)] });
    renderPage();
    const all = await screen.findByRole('checkbox', { name: 'Chọn tất cả 2 sinh viên đang hiện' });
    expect(bar()).toHaveAttribute('aria-hidden', 'true');
    expect(bar()).toHaveClass('lk-bulkbar--idle');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn SV 01' }));
    expect((all as HTMLInputElement).indeterminate).toBe(true);
    expect(bar()).not.toHaveAttribute('aria-hidden');
    expect(within(bar()).getByText('Đã chọn 1 sinh viên')).toBeInTheDocument();

    fireEvent.click(all);
    expect((all as HTMLInputElement).indeterminate).toBe(false);
    expect(all).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Chọn SV 02' })).toBeChecked();
    const locked = screen.getByRole('checkbox', { name: 'Chọn SV 03' });
    expect(locked).toBeDisabled();
    expect(locked).not.toBeChecked();
    expect(locked).toHaveAccessibleDescription('Đã có bài nộp');
    expect(screen.getByRole('button', { name: 'Gỡ 2 sinh viên' })).toHaveClass('lk-btn--danger');

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn' }));
    expect(all).not.toBeChecked();
    expect(bar()).toHaveClass('lk-bulkbar--idle');
  });

  it('Shift+click selects the range between two rows', async () => {
    serve({ members: [1, 2, 3, 4, 5].map((n) => student(n)) });
    renderPage();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Chọn SV 02' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn SV 04' }), { shiftKey: true });
    expect(
      screen
        .getAllByRole('checkbox')
        .slice(1)
        .map((c) => (c as HTMLInputElement).checked),
    ).toEqual([false, true, true, true, false]);
  });

  it('names five students and "và N khác", shows progress, runs at most 4 at once', async () => {
    const world: World = {
      members: Array.from({ length: 7 }, (_, i) => student(i + 1)),
      hold: true,
    };
    const server = serve(world);
    renderPage();
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Chọn tất cả 7 sinh viên đang hiện' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ 7 sinh viên' }));

    const dialog = screen.getByRole('dialog', { name: 'Gỡ 7 sinh viên khỏi Web?' });
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['SV 01', 'SV 02', 'SV 03', 'SV 04', 'SV 05', 'và 2 khác']);
    expect(within(dialog).getByRole('button', { name: 'Huỷ' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gỡ 7 sinh viên' }));

    await waitFor(() => {
      expect(server.waiting()).toBe(4);
    });
    expect(within(dialog).getByRole('button', { name: 'Đang gỡ 0/7…' })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => {
      server.release();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(server.waiting()).toBe(3);
    });
    expect(within(dialog).getByRole('button', { name: 'Đang gỡ 4/7…' })).toBeInTheDocument();
    await act(async () => {
      server.release();
      await Promise.resolve();
    });
    expect(
      await screen.findByRole('dialog', { name: 'Đã gỡ 7/7 sinh viên khỏi Web' }),
    ).toBeInTheDocument();
    expect(server.maxRunning()).toBe(4);
  });

  it('reports each student, keeps failed rows selected and toasts the summary', async () => {
    serve({
      members: [student(1), student(2), student(3), student(4)],
      conflict: ['sv-02'],
      broken: ['sv-03'],
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Chọn tất cả 4 sinh viên đang hiện' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ 4 sinh viên' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Gỡ 4 sinh viên' }),
    );

    const done = await screen.findByRole('dialog', { name: 'Đã gỡ 2/4 sinh viên khỏi Web' });
    const rows = within(done).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      'SV 01Đã gỡ',
      'SV 02Đã có bài nộp, chưa gỡ',
      'SV 03Lỗi: Không tìm thấy lớp',
      'SV 04Đã gỡ',
    ]);
    expect(
      within(done)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Đóng']);
    const toasts = screen.getByRole('status', { name: 'Thông báo' });
    expect(within(toasts).getByText('Đã gỡ 2/4 sinh viên.')).toBeInTheDocument();

    fireEvent.click(within(done).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Chọn SV 01' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Chọn SV 02' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Chọn SV 03' })).toBeChecked();
    expect(within(bar()).getByText('Đã chọn 2 sinh viên')).toBeInTheDocument();
  });

  it('focuses the students heading when every selected student was removed', async () => {
    serve({ members: [student(1), student(2)] });
    renderPage();
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Chọn tất cả 2 sinh viên đang hiện' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ 2 sinh viên' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Gỡ 2 sinh viên' }),
    );
    const done = await screen.findByRole('dialog', { name: 'Đã gỡ 2/2 sinh viên khỏi Web' });
    fireEvent.click(within(done).getByRole('button', { name: 'Đóng' }));
    expect(await screen.findByRole('heading', { name: 'Sinh viên (0)' })).toHaveFocus();
  });
});

describe('runLimited', () => {
  it('keeps item order, never exceeds the limit and reports progress', async () => {
    let running = 0;
    let max = 0;
    const progress: number[] = [];
    const result = await runLimited(
      [30, 10, 20, 5, 15, 25],
      2,
      async (ms) => {
        running += 1;
        max = Math.max(max, running);
        await new Promise((resolve) => setTimeout(resolve, ms));
        running -= 1;
        return ms * 2;
      },
      (n) => progress.push(n),
    );
    expect(result).toEqual([60, 20, 40, 10, 30, 50]);
    expect(max).toBe(2);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('resolves at once for no items', async () => {
    await expect(runLimited([], 4, () => Promise.resolve(1))).resolves.toEqual([]);
  });
});
