import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { routes } from './routes';

const EXPIRED = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';

function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fakeToken(role: 'TA' | 'STUDENT'): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${base64url({ alg: 'HS256' })}.${base64url({ sub: role, role, exp })}.sig`;
}

function json(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
}

/** Login answers with the role in `nextRole`; other requests answer `[]` or 401. */
function stubServer(state: { nextRole: 'TA' | 'STUDENT'; unauthorized: boolean }) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      if (input.endsWith('/auth/login')) {
        return Promise.resolve(
          json({ token: fakeToken(state.nextRole), role: state.nextRole, displayName: null }),
        );
      }
      if (state.unauthorized) {
        return Promise.resolve(
          json(
            { type: 'urn:leetkob:problem:unauthenticated', title: 'x', status: 401 },
            401,
            'application/problem+json',
          ),
        );
      }
      return Promise.resolve(json([]));
    }),
  );
}

function storeSession(role: 'ta' | 'student') {
  const token = fakeToken(role === 'ta' ? 'TA' : 'STUDENT');
  localStorage.setItem(
    'leetkob.session',
    JSON.stringify({ token, role, email: `${role}@leetkob.test`, displayName: role }),
  );
  localStorage.setItem('leetkob.token', token);
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

function signIn(email: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
}

async function waitForPath(router: ReturnType<typeof renderAt>, path: string) {
  await waitFor(
    () => {
      expect(router.state.location.pathname).toBe(path);
    },
    { timeout: 5000 },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Đăng xuất forgets where the user was', () => {
  it('goes to /login without next, and the next person starts at their own home', async () => {
    const server = { nextRole: 'STUDENT' as const, unauthorized: false };
    stubServer(server);
    storeSession('ta');
    const router = renderAt('/ta/classes');
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng xuất' }));

    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('');
    expect(screen.queryByText(EXPIRED)).toBeNull();

    signIn('sv1@leetkob.test');
    await waitForPath(router, '/student/submit');
  });

  it('a TA signing in after a TA signed out lands on the TA home, not the last page', async () => {
    stubServer({ nextRole: 'TA', unauthorized: false });
    storeSession('ta');
    const router = renderAt('/ta/review-queue');
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng xuất' }));
    await screen.findByRole('heading', { name: 'Đăng nhập' });

    signIn('ta2@leetkob.test');
    await waitForPath(router, '/ta/classes');
  });

  it('going back after signing out does not bring next back', async () => {
    stubServer({ nextRole: 'TA', unauthorized: false });
    storeSession('ta');
    const router = renderAt('/ta/classes');
    await screen.findByRole('button', { name: 'Đăng xuất' });
    await act(async () => {
      await router.navigate('/ta/review-queue');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await screen.findByRole('heading', { name: 'Đăng nhập' });

    await act(async () => {
      await router.navigate(-1);
    });
    await waitForPath(router, '/login');
    expect(router.state.location.search).toBe('');
  });
});

describe('next after an expired session', () => {
  it('is ignored when someone of the other role signs in', async () => {
    const server = { nextRole: 'STUDENT' as const, unauthorized: true };
    stubServer(server);
    storeSession('ta');
    const router = renderAt('/ta/classes');
    expect(await screen.findByText(EXPIRED, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe('/ta/classes');

    server.unauthorized = false;
    signIn('sv1@leetkob.test');
    await waitForPath(router, '/student/submit');
  });
});
