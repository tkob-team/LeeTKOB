import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ApiProblemError } from '../../api/client';
import type { ProblemDetails } from '../../api/problem';
import { AuthContext, type AuthState } from '../../app/auth-context';
import { LoginPage } from './LoginPage';

function renderLogin(problem: ProblemDetails) {
  const login = vi.fn<AuthState['login']>(() => Promise.reject(new ApiProblemError(problem)));
  render(
    <AuthContext value={{ session: null, login, logout: vi.fn() }}>
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    </AuthContext>,
  );
}

describe('a failed sign-in keeps what was typed', () => {
  it.each([
    [
      'wrong email or password (401)',
      {
        type: 'urn:leetkob:problem:invalid-credentials',
        title: 'Email or password is incorrect',
        status: 401,
      },
      'Sai email hoặc mật khẩu',
    ],
    [
      'too many attempts (429)',
      { type: 'urn:leetkob:problem:too-many-attempts', title: 'x', status: 429 },
      'Thử sai quá nhiều lần',
    ],
    [
      'no connection',
      { type: 'about:blank', title: 'Không kết nối được máy chủ', status: 0 },
      'Không kết nối được máy chủ',
    ],
  ])(
    '%s: both fields kept, password focused with the caret at the end',
    async (_, problem, title) => {
      renderLogin(problem);
      const email = screen.getByLabelText('Email');
      const password = screen.getByLabelText<HTMLInputElement>('Mật khẩu');
      fireEvent.change(email, { target: { value: 'sv1@leetkob.test' } });
      fireEvent.change(password, { target: { value: 'secret-123' } });
      email.focus();
      fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(title);
      expect(email).toHaveValue('sv1@leetkob.test');
      expect(password).toHaveValue('secret-123');
      expect(password).toHaveFocus();
      // Caret after the last character, nothing selected.
      expect(password.selectionStart).toBe('secret-123'.length);
      expect(password.selectionEnd).toBe('secret-123'.length);
    },
  );
});
