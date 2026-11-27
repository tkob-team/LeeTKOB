import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterLoginPath, loginPath } from './auth-context';
import { AuthProvider } from './AuthProvider';
import { routes } from './routes';

const EXPIRED = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';

function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fakeToken(role: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${base64url({ alg: 'HS256' })}.${base64url({ sub: 'u1', role, exp })}.sig`;
}

function json(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
}

const unauthenticated = () =>
  json(
    {
      type: 'urn:leetkob:problem:unauthenticated',
      title: 'Authentication is required',
      status: 401,
    },
    401,
    'application/problem+json',
  );

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

function storeSession(role: 'ta' | 'student') {
  const token = fakeToken(role === 'ta' ? 'TA' : 'STUDENT');
  localStorage.setItem(
    'leetkob.session',
    JSON.stringify({ token, role, email: 'sv1@leetkob.test', displayName: 'SV' }),
  );
  localStorage.setItem('leetkob.token', token);
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('a 401 from the shared API client', () => {
  it('clears the session, sends the user to /login?next=<page> and explains why', async () => {
    let expired = true;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (input.endsWith('/auth/login')) {
          return Promise.resolve(
            json({ token: fakeToken('STUDENT'), role: 'STUDENT', displayName: 'SV' }),
          );
        }
        return Promise.resolve(expired ? unauthenticated() : json([]));
      }),
    );
    storeSession('student');
    const router = renderAt('/student/labs?sort=due');

    // Several requests and redirects in a row: allow for a busy test worker.
    expect(await screen.findByText(EXPIRED, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe(
      '/student/labs?sort=due',
    );
    expect(localStorage.getItem('leetkob.session')).toBeNull();
    expect(localStorage.getItem('leetkob.token')).toBeNull();
    // The server's English title never reaches the page.
    expect(screen.queryByText(/Authentication is required/)).toBeNull();

    expired = false;
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sv1@leetkob.test' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    // The list page swaps its loading heading for the empty state, so wait on the URL.
    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/student/labs');
      },
      { timeout: 5000 },
    );
    expect(router.state.location.search).toBe('?sort=due');
    expect(screen.queryByText(EXPIRED)).toBeNull();
  });

  it('a signed-out visit keeps next but does not say the session expired', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json([]))),
    );
    const router = renderAt('/ta/review-queue');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/ta/review-queue')}`);
    expect(screen.queryByText(EXPIRED)).toBeNull();
  });
});

describe('next after signing in', () => {
  it('builds the login path with an encoded next', () => {
    expect(loginPath('/student/submit?lab=a b')).toBe(
      '/login?next=%2Fstudent%2Fsubmit%3Flab%3Da%20b',
    );
  });

  it.each([
    ['student' as const, '/student/labs/1', '/student/labs/1'],
    ['student' as const, '/ta/labs', '/student/submit'],
    ['ta' as const, '/student/submit', '/ta/labs'],
    ['ta' as const, 'https://evil.example/ta/', '/ta/labs'],
    ['ta' as const, '//evil.example/ta/labs', '/ta/labs'],
    ['ta' as const, null, '/ta/labs'],
  ])('for %s, next %s goes to %s', (role, next, expected) => {
    expect(afterLoginPath(role, next)).toBe(expected);
  });
});
