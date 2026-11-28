import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { routes } from './routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fakeToken(role: string): string {
  const exp = Math.floor(Date.now() / 1000) + 8 * 3600;
  return `${base64url({ alg: 'HS256' })}.${base64url({ sub: 'u1', role, exp })}.sig`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** POST /auth/login answers `login`; every other request answers an empty list. */
function stubFetch(login: () => Response = () => json({})) {
  const fetchMock = vi.fn((input: string) =>
    Promise.resolve(input.endsWith('/auth/login') ? login() : json([])),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function storeSession(role: 'admin' | 'ta' | 'student', token: string) {
  localStorage.setItem(
    'leetkob.session',
    JSON.stringify({ token, role, email: 'x@truong.edu.vn', displayName: 'Quan Tri' }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('admin routes', () => {
  it('signs an admin in and lands on /admin/classes with the admin menu', async () => {
    const fetchMock = stubFetch(() =>
      json({ token: fakeToken('ADMIN'), role: 'ADMIN', displayName: 'Quan Tri' }),
    );
    const router = renderAt('/login');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'admin@truong.edu.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('heading', { name: 'Lớp học', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/classes');
    expect(screen.getByText('Quan Tri · Quản trị')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(within(nav).getByRole('link', { name: 'Lớp học' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(fetchMock).toHaveBeenCalledWith('/admin/classes', expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
  });

  it('writes the admin role once when the name already says it ("Quản trị viên")', async () => {
    stubFetch();
    localStorage.setItem(
      'leetkob.session',
      JSON.stringify({
        token: fakeToken('ADMIN'),
        role: 'admin',
        email: 'admin@leetkob.test',
        displayName: 'Quản trị viên',
      }),
    );
    renderAt('/admin/classes');
    await screen.findByRole('heading', { name: 'Lớp học', level: 1 });
    const banner = document.querySelector<HTMLElement>('.lk-shell__header');
    if (!banner) throw new Error('expected the app header');
    expect(within(banner).getByText('Quản trị viên')).toHaveClass('lk-shell__who');
    expect(banner).not.toHaveTextContent('Quản trị viên · Quản trị');
  });

  it('opens a class page from the list, inside the admin layout', async () => {
    const id = '1b2c3d4e-0000-4000-8000-000000000001';
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (input === '/admin/classes') {
          return Promise.resolve(
            json([{ id, name: 'Web nâng cao', inviteCode: null, tas: [], studentCount: 0 }]),
          );
        }
        if (input === `/classes/${id}`) {
          return Promise.resolve(json({ id, name: 'Web nâng cao', inviteCode: null }));
        }
        return Promise.resolve(json([]));
      }),
    );
    storeSession('admin', fakeToken('ADMIN'));
    const router = renderAt('/admin/classes');
    fireEvent.click(await screen.findByRole('link', { name: 'Web nâng cao' }));
    expect(
      await screen.findByRole('heading', { name: 'Web nâng cao', level: 1 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/admin/classes/${id}`);
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(within(nav).getByRole('link', { name: 'Lớp học' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('sends a signed-in admin from / and /admin to /admin/classes', async () => {
    stubFetch();
    storeSession('admin', fakeToken('ADMIN'));
    const router = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Lớp học', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/classes');
    await act(() => router.navigate('/admin'));
    expect(router.state.location.pathname).toBe('/admin/classes');
  });

  it('keeps an admin out of TA and student pages', async () => {
    stubFetch();
    storeSession('admin', fakeToken('ADMIN'));
    const router = renderAt('/ta/labs');
    await screen.findByRole('heading', { name: 'Lớp học', level: 1 });
    expect(router.state.location.pathname).toBe('/admin/classes');
    await act(() => router.navigate('/student/labs'));
    expect(router.state.location.pathname).toBe('/admin/classes');
  });

  it.each([
    ['ta' as const, 'TA', '/ta/labs'],
    ['student' as const, 'STUDENT', '/student/submit'],
  ])('keeps a %s out of /admin/classes', async (role, claim, home) => {
    stubFetch();
    storeSession(role, fakeToken(claim));
    const router = renderAt('/admin/classes');
    await screen.findByRole('button', { name: 'Đăng xuất' });
    expect(router.state.location.pathname).toBe(home);
    expect(screen.queryByRole('heading', { name: 'Lớp học', level: 1 })).toBeNull();
  });

  it('sends a signed-out visitor of /admin/classes to the login page with next', async () => {
    stubFetch();
    const router = renderAt('/admin/classes');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/admin/classes')}`);
  });
});
