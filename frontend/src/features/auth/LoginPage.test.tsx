import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
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
