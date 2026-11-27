import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ApiProblemError } from '../../api/client';
import type { ProblemDetails } from '../../api/problem';
import { AuthContext, type AuthState } from '../../app/auth-context';
import { LoginPage } from './LoginPage';

function renderLogin(login: AuthState['login'] = vi.fn()) {
  const auth: AuthState = { session: null, login, logout: vi.fn() };
  render(
    <AuthContext value={auth}>
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    </AuthContext>,
  );
  return auth;
}

describe('login page layout', () => {
  it('centres one column and keeps the form and its messages in one container', () => {
    renderLogin();
    const form = screen.getByRole('form', { name: 'Đăng nhập' });
    expect(form).toHaveClass('lk-auth__form');
    expect(form.closest('main')).toHaveClass('lk-auth');
  });

  it('marks email and password as required', () => {
    renderLogin();
    expect(screen.getByLabelText('Email')).toBeRequired();
    expect(screen.getByLabelText('Mật khẩu')).toBeRequired();
  });

  it('tells users who forgot their password whom to ask, as plain text', () => {
    renderLogin();
    const hint = screen.getByText('Quên mật khẩu? Liên hệ trợ giảng hoặc quản trị viên.');
    expect(hint.tagName).toBe('P');
    expect(hint.closest('a')).toBeNull();
    expect(screen.queryByRole('link', { name: /Quên mật khẩu/ })).toBeNull();
  });
});

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: password } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /Đăng nhập|Đang đăng nhập…/ }));
}

function rejectWith(problem: ProblemDetails) {
  return vi.fn<AuthState['login']>(() => Promise.reject(new ApiProblemError(problem)));
}

describe('login form errors', () => {
  it('shows each field error under its field, marks it invalid and focuses the first one', () => {
    const login = vi.fn<AuthState['login']>();
    renderLogin(login);
    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Mật khẩu');

    submit();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Nhập email.');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription('Nhập mật khẩu.');
    expect(email.closest('.lk-field')).toHaveClass('lk-field--error');
    const note = document.getElementById(email.getAttribute('aria-describedby') ?? '');
    expect(note).toHaveClass('lk-field__error');
    expect(note?.previousElementSibling).toBe(email);
    expect(email).toHaveFocus();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(login).not.toHaveBeenCalled();

    fill('nope', 'secret');
    expect(email).toHaveAccessibleDescription('Nhập email có dạng ten@truong.edu.vn.');
    expect(password).not.toHaveAttribute('aria-invalid');
    submit();
    expect(email).toHaveFocus();
    expect(login).not.toHaveBeenCalled();

    fill('sv01@truong.edu.vn', '');
    submit();
    expect(email).not.toHaveAttribute('aria-invalid');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveFocus();
    expect(login).not.toHaveBeenCalled();
  });

  it('on a wrong email or password (401) alerts above the button, keeps both fields, focuses the password', async () => {
    renderLogin(
      rejectWith({
        type: 'urn:leetkob:problem:invalid-credentials',
        title: 'Sai email hoặc mật khẩu',
        status: 401,
        detail: 'Kiểm tra lại email và mật khẩu rồi thử lại.',
      }),
    );
    fill('sv01@truong.edu.vn', 'wrong');
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sai email hoặc mật khẩu');
    const button = screen.getByRole('button', { name: 'Đăng nhập' });
    expect(alert.nextElementSibling).toBe(button.parentElement);
    expect(screen.getByRole('heading', { name: 'Đăng nhập' }).nextElementSibling).not.toBe(alert);
    expect(screen.getByLabelText('Email')).toHaveValue('sv01@truong.edu.vn');
    // fix/login-password-field: the password is kept (was cleared), so a typo can be fixed.
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('wrong');
    expect(screen.getByLabelText('Mật khẩu')).toHaveFocus();
  });

  it.each([
    [
      'too many attempts (429)',
      {
        type: 'urn:leetkob:problem:too-many-attempts',
        title: 'Thử sai quá nhiều lần',
        status: 429,
        detail: 'Tạm khoá đăng nhập. Đợi khoảng 15 phút rồi thử lại.',
      },
      'Thử sai quá nhiều lần',
    ],
    [
      'a network failure',
      { type: 'about:blank', title: 'Không kết nối được máy chủ', status: 0 },
      'Không kết nối được máy chủ',
    ],
    [
      'a server error (500)',
      { type: 'about:blank', title: 'Internal Server Error', status: 500 },
      'Máy chủ đang gặp sự cố',
    ],
  ])('on %s shows its own message in the same place', async (_, problem, title) => {
    renderLogin(rejectWith(problem));
    fill('sv01@truong.edu.vn', 'secret');
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.querySelector('.lk-problem__title')).toHaveTextContent(new RegExp(`^${title}$`));
    expect(alert.nextElementSibling).toBe(
      screen.getByRole('button', { name: 'Đăng nhập' }).parentElement,
    );
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('secret');
  });

  it('locks the button and says "Đang đăng nhập…" while sending, without sending twice', async () => {
    let finish: () => void = () => undefined;
    const login = vi.fn<AuthState['login']>(
      () =>
        new Promise((_, reject) => {
          finish = () => {
            reject(
              new ApiProblemError({
                type: 'urn:leetkob:problem:invalid-credentials',
                title: 'Sai email hoặc mật khẩu',
                status: 401,
              }),
            );
          };
        }),
    );
    renderLogin(login);
    fill('sv01@truong.edu.vn', 'secret');
    submit();

    const busy = await screen.findByRole('button', { name: 'Đang đăng nhập…' });
    expect(busy).toBeDisabled();
    fireEvent.submit(busy.closest('form') as HTMLFormElement);
    fireEvent.submit(busy.closest('form') as HTMLFormElement);
    expect(login).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(await screen.findByRole('button', { name: 'Đăng nhập' })).toBeEnabled();
  });
});
