import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../../app/auth-context';
import { LoginPage } from '../../features/auth/LoginPage';
import { FormField } from './FormField';
import { PasswordInput } from './PasswordInput';

function renderField(
  onSubmit = vi.fn((event: { preventDefault: () => void }) => {
    event.preventDefault();
  }),
) {
  render(
    <form onSubmit={onSubmit}>
      <FormField label="Mật khẩu" error="Nhập mật khẩu.">
        <PasswordInput defaultValue="abc123" />
      </FormField>
    </form>,
  );
  return {
    onSubmit,
    input: screen.getByLabelText<HTMLInputElement>('Mật khẩu'),
    toggle: () => screen.getByRole('button', { name: /mật khẩu$/ }),
  };
}

const icon = (button: HTMLElement) => button.querySelector('svg')?.getAttribute('data-icon');

describe('PasswordInput', () => {
  it('starts hidden: type="password", crossed-out eye, "Hiện mật khẩu", not pressed', () => {
    const { input, toggle } = renderField();
    expect(input).toHaveAttribute('type', 'password');
    expect(toggle()).toHaveAccessibleName('Hiện mật khẩu');
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(icon(toggle())).toBe('eye-closed');
  });

  it('a click shows the password with an open eye; a second click hides it again', () => {
    const { input, toggle } = renderField();
    fireEvent.click(toggle());
    expect(input).toHaveAttribute('type', 'text');
    expect(toggle()).toHaveAccessibleName('Ẩn mật khẩu');
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(icon(toggle())).toBe('eye-open');

    fireEvent.click(toggle());
    expect(input).toHaveAttribute('type', 'password');
    expect(toggle()).toHaveAccessibleName('Hiện mật khẩu');
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(icon(toggle())).toBe('eye-closed');
  });

  it('never submits the form and is a plain button reachable with Tab', () => {
    const { onSubmit, toggle } = renderField();
    expect(toggle()).toHaveAttribute('type', 'button');
    expect(toggle()).not.toHaveAttribute('tabindex', '-1');
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the focus and the caret in the field when clicked', () => {
    const { input, toggle } = renderField();
    input.focus();
    input.setSelectionRange(2, 2);

    const press = fireEvent.mouseDown(toggle());
    // preventDefault on mousedown is what keeps the browser from moving the focus.
    expect(press).toBe(false);
    fireEvent.click(toggle());

    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('type', 'text');
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
  });

  it('keeps the FormField label, description and invalid state on the input', () => {
    const { input } = renderField();
    expect(input).toHaveAccessibleDescription('Nhập mật khẩu.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('places the button inside the field on the right, coloured by tokens', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    const toggle = /\.lk-password__toggle \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(toggle).toContain('position: absolute;');
    expect(toggle).toContain('right: var(--space-1);');
    expect(toggle).toContain('color: var(--ink-muted);');
    expect(toggle).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe('login page password field', () => {
  it('uses the show/hide button, and pressing it does not sign in', () => {
    const login = vi.fn<AuthState['login']>();
    render(
      <AuthContext value={{ session: null, login, logout: vi.fn() }}>
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>
      </AuthContext>,
    );
    const password = screen.getByLabelText('Mật khẩu');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sv1@leetkob.test' } });
    fireEvent.change(password, { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(login).not.toHaveBeenCalled();
  });
});
