import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { routes } from './routes';

function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function storeSession(role: 'ta' | 'student') {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${base64url({ alg: 'HS256' })}.${base64url({ sub: 'u1', role, exp })}.sig`;
  localStorage.setItem(
    'leetkob.session',
    JSON.stringify({ token, role, email: 'x@leetkob.test', displayName: 'Người dùng' }),
  );
  localStorage.setItem('leetkob.token', token);
}

function renderAt(path: string) {
  render(
    <AuthProvider>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </AuthProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('404 page', () => {
  it.each([
    ['ta' as const, 'Trợ giảng', ['Lab']],
    ['student' as const, 'Sinh viên', ['Đề bài', 'Nộp bài']],
  ])(
    'signed in as %s, sits in the app layout with menu and Đăng xuất',
    async (role, label, nav) => {
      storeSession(role);
      renderAt('/no/such/page');

      expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
      const header = screen.getByRole('banner');
      expect(header).toHaveClass('lk-shell__header');
      expect(within(header).getByText(`Người dùng · ${label}`)).toBeInTheDocument();
      expect(within(header).getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
      const menu = within(header).getByRole('navigation', { name: 'Điều hướng chính' });
      expect(
        within(menu)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(nav);
      // One main landmark only: the page is not nested in a second <main>.
      expect(screen.getAllByRole('main')).toHaveLength(1);
    },
  );

  it('signed out, uses the public frame without the app header', async () => {
    renderAt('/no/such/page');
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
    expect(screen.getByRole('banner')).toHaveClass('lk-public__bar');
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});
