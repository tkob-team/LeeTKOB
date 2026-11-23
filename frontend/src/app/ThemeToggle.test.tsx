import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentLayout, TaLayout } from './AppLayout';
import { AuthContext, type AuthState, type Role } from './auth-context';
import { applyStoredTheme, currentTheme, THEME_KEY } from './theme';
import { ThemeToggle } from './ThemeToggle';

function systemPrefersDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: dark && query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function auth(role: Role): AuthState {
  return {
    session: { token: 't', role, email: 'x@leetkob.test', displayName: 'X' },
    login: vi.fn(),
    logout: vi.fn(),
  };
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows the operating system until the viewer chooses', () => {
    systemPrefersDark(true);
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(currentTheme()).toBe('dark');
    systemPrefersDark(false);
    expect(currentTheme()).toBe('light');
  });

  it('a saved choice wins over the operating system', () => {
    systemPrefersDark(true);
    localStorage.setItem(THEME_KEY, 'light');
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(currentTheme()).toBe('light');
  });

  it('ignores an unknown saved value', () => {
    systemPrefersDark(false);
    localStorage.setItem(THEME_KEY, 'purple');
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(currentTheme()).toBe('light');
  });

  it('the toggle switches, applies and saves the theme', () => {
    systemPrefersDark(true);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang giao diện sáng' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang giao diện tối' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });
});

describe('app header', () => {
  it.each([
    ['ta' as const, <TaLayout key="ta" />, '/ta/classes'],
    ['student' as const, <StudentLayout key="student" />, '/student/submit'],
  ])('the LeeTKOB brand links %s users to their home page', (role, layout, home) => {
    render(
      <AuthContext value={auth(role)}>
        <MemoryRouter>{layout}</MemoryRouter>
      </AuthContext>,
    );
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'LeeTKOB' })).toHaveAttribute('href', home);
    expect(within(header).getByRole('button', { name: /Chuyển sang giao diện/ })).toBeVisible();
  });
});
