import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, storedToken } from '../api/client';
import { AuthProvider } from './AuthProvider';
import { routes } from './routes';

const EXPIRED = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';

function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fakeToken(role: 'TA' | 'STUDENT'): string {
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

/** Like the backend: a request without a bearer token gets 401. */
function stubBackend() {
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    if (input.endsWith('/auth/login')) {
      return Promise.resolve(
        json(
          { type: 'urn:leetkob:problem:invalid-credentials', title: 'x', status: 401 },
          401,
          'application/problem+json',
        ),
      );
    }
    const auth = new Headers(init?.headers).get('Authorization');
    return Promise.resolve(auth ? json([]) : unauthenticated());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function storeSession(role: 'ta' | 'student', extra: Record<string, unknown> = {}) {
  const token = fakeToken(role === 'ta' ? 'TA' : 'STUDENT');
  localStorage.setItem(
    'leetkob.session',
    JSON.stringify({ token, role, email: `${role}@leetkob.test`, displayName: 'SV', ...extra }),
  );
  return token;
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

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('any 401 ends the session', () => {
  it('token gone from storage → click the menu → /login?next=… with the expired note', async () => {
    stubBackend();
    storeSession('student');
    const router = renderAt('/student/submit');
    await screen.findByRole('button', { name: 'Đăng xuất' });

    // The token disappears while the page is open (cleared by hand or by another program).
    const session = JSON.parse(localStorage.getItem('leetkob.session') ?? '{}') as object;
    localStorage.setItem('leetkob.session', JSON.stringify({ ...session, token: undefined }));
    fireEvent.click(screen.getByRole('link', { name: 'Đề bài' }));

    expect(await screen.findByText(EXPIRED, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe('/student/labs');
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull();
    expect(localStorage.getItem('leetkob.session')).toBeNull();
  });

  it('a wrong password at login only shows the form error', async () => {
    const fetchMock = stubBackend();
    const router = renderAt('/login');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'sv1@leetkob.test' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sai email hoặc mật khẩu');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('');
    expect(screen.queryByText(EXPIRED)).toBeNull();
    expect(screen.getByLabelText('Email')).toHaveValue('sv1@leetkob.test');
  });
});

describe('the token is stored in one place', () => {
  it('a signed-in user of an older build stays signed in; the old key is removed', async () => {
    stubBackend();
    const token = storeSession('ta');
    localStorage.setItem('leetkob.token', token);
    const router = renderAt('/ta/labs');

    expect(await screen.findByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/ta/labs');
    expect(localStorage.getItem('leetkob.token')).toBeNull();
    expect(storedToken()).toBe(token);
  });

  it('an older session without its own token takes the old copy once', async () => {
    stubBackend();
    const token = fakeToken('TA');
    storeSession('ta', { token: undefined });
    localStorage.setItem('leetkob.token', token);
    renderAt('/ta/labs');

    expect(await screen.findByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(storedToken()).toBe(token);
    expect(localStorage.getItem('leetkob.token')).toBeNull();
  });

  it('removing the old key changes nothing: requests read the session', async () => {
    const fetchMock = stubBackend();
    const token = storeSession('student');
    localStorage.removeItem('leetkob.token');
    renderAt('/student/labs');
    await screen.findByRole('button', { name: 'Đăng xuất' });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
  });
});

describe('createApiClient onUnauthorized', () => {
  it('fires for a 401 without a token, but not for POST /auth/login', async () => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: '',
      getToken: () => null,
      fetch: () => Promise.resolve(unauthenticated()),
      onUnauthorized,
    });
    await expect(client.request('/auth/login', { method: 'POST', body: '{}' })).rejects.toThrow();
    expect(onUnauthorized).not.toHaveBeenCalled();
    await expect(client.request('/student/labs')).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await expect(
      client.request('/auth/login?x=1', { method: 'post', body: '{}' }),
    ).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
