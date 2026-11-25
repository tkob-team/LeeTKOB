import { act, fireEvent, render, screen } from '@testing-library/react';
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

/** An unsigned fake JWT; the browser only reads `exp`, the backend verifies the signature. */
function fakeToken(role: string, expSeconds = Math.floor(Date.now() / 1000) + 8 * 3600): string {
  return `${base64url({ alg: 'HS256' })}.${base64url({ sub: 'u1', role, exp: expSeconds })}.sig`;
}

function json(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
}

/** Stubs fetch: POST /auth/login answers `login`; every other path answers `other`. */
function stubFetch(login: () => Response, other: () => Response = () => json([])) {
  const fetchMock = vi.fn((input: string) =>
    Promise.resolve(input.endsWith('/auth/login') ? login() : other()),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function storeSession(role: 'ta' | 'student', token: string) {
  sessionStorage.setItem(
    'leetkob.session',
    JSON.stringify({ token, role, email: 'sv01@truong.edu.vn', displayName: 'SV' }),
  );
  sessionStorage.setItem('leetkob.token', token);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('app shell routes', () => {
  it('sends a signed-out user to the login page', async () => {
    const router = renderAt('/ta/review-queue');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows field errors before sending a request', async () => {
    renderAt('/login');
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa đăng nhập được');
    expect(screen.getByLabelText('Mật khẩu')).toHaveAccessibleDescription('Nhập mật khẩu.');
  });

  it('signs a TA in, returns to the requested page, and keeps students out', async () => {
    const fetchMock = stubFetch(() =>
      json({ token: fakeToken('TA'), role: 'TA', displayName: 'Thay Ta' }),
    );
    const router = renderAt('/ta/review-queue');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'ta01@truong.edu.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('heading', { name: 'Hàng chờ duyệt' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/ta/review-queue');
    expect(fetchMock).toHaveBeenCalledWith(
      '/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'ta01@truong.edu.vn', password: 'x' }),
      }),
    );
    expect(screen.getByText(/Thay Ta/)).toBeInTheDocument();

    await router.navigate('/student/submit');
    expect(
      await screen.findByRole('heading', { name: 'Lab và hàng chờ duyệt' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/ta/labs');

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
  });

  it('sends a TA to the lab list after sign-in', async () => {
    stubFetch(() => json({ token: fakeToken('TA'), role: 'TA', displayName: 'Thay Ta' }));
    const router = renderAt('/login');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'ta01@truong.edu.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      await screen.findByRole('heading', { name: 'Lab và hàng chờ duyệt' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/ta/labs');
    expect(screen.getByRole('link', { name: 'LeeTKOB' })).toHaveAttribute('href', '/ta/labs');
  });

  it('redirects the old TA home /ta/classes to /ta/labs', async () => {
    stubFetch(() => json({}));
    storeSession('ta', fakeToken('TA'));
    const router = renderAt('/ta/classes');
    expect(
      await screen.findByRole('heading', { name: 'Lab và hàng chờ duyệt' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/ta/labs');
  });

  it('keeps students on their own home: / and /ta/classes lead to /student/submit', async () => {
    stubFetch(() => json({}));
    storeSession('student', fakeToken('STUDENT'));
    const router = renderAt('/');
    await screen.findByText(/SV · Sinh viên/);
    expect(router.state.location.pathname).toBe('/student/submit');
    await act(() => router.navigate('/ta/classes'));
    expect(router.state.location.pathname).toBe('/student/submit');
    expect(screen.getByRole('link', { name: 'LeeTKOB' })).toHaveAttribute(
      'href',
      '/student/submit',
    );
  });

  it('sends a student to the student home after sign-in', async () => {
    // Build the token once: its `exp` comes from the clock, so a second call at assertion time
    // can land in the next second and differ from the token the login stub returned.
    const token = fakeToken('STUDENT');
    stubFetch(() => json({ token, role: 'STUDENT', displayName: null }));
    const router = renderAt('/login');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'sv01@truong.edu.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText(/sv01 · Sinh viên/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/student/submit');
    expect(sessionStorage.getItem('leetkob.token')).toBe(token);
  });

  it('shows one message for a wrong email or password and stays signed out', async () => {
    stubFetch(() =>
      json(
        {
          type: 'urn:leetkob:problem:invalid-credentials',
          title: 'Email or password is incorrect',
          status: 401,
          detail: 'The email or the password is incorrect.',
        },
        401,
        'application/problem+json',
      ),
    );
    const router = renderAt('/login');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'sv01@truong.edu.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sai email hoặc mật khẩu');
    expect(router.state.location.pathname).toBe('/login');
    expect(sessionStorage.getItem('leetkob.token')).toBeNull();
  });

  it('drops a stored session whose token has expired', async () => {
    storeSession('student', fakeToken('STUDENT', Math.floor(Date.now() / 1000) - 1));
    const router = renderAt('/student/submit');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(sessionStorage.getItem('leetkob.token')).toBeNull();
  });

  it('signs out when the token expires while the page is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    storeSession('ta', fakeToken('TA', Math.floor(Date.now() / 1000) + 60));
    const router = renderAt('/ta/review-queue');
    expect(await screen.findByRole('heading', { name: 'Hàng chờ duyệt' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('returns to the login page when the API answers 401', async () => {
    stubFetch(
      () => json({}),
      () =>
        json(
          {
            type: 'urn:leetkob:problem:unauthenticated',
            title: 'Authentication is required',
            status: 401,
          },
          401,
          'application/problem+json',
        ),
    );
    storeSession('student', fakeToken('STUDENT'));
    const router = renderAt('/student/submit');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(sessionStorage.getItem('leetkob.session')).toBeNull();
  });
});
