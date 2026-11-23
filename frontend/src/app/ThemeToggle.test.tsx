import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentLayout, TaLayout } from './AppLayout';
import { AuthContext, type AuthState, type Role } from './auth-context';
import {
  applyStoredTheme,
  currentTheme,
  THEME_CHANGING_CLASS,
  THEME_KEY,
  THEME_TRANSITION_MS,
} from './theme';
import { ThemeToggle } from './ThemeToggle';

function systemPrefersDark(dark: boolean, reducedMotion = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches:
        (dark && query === '(prefers-color-scheme: dark)') ||
        (reducedMotion && query === '(prefers-reduced-motion: reduce)'),
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

  it('the switch shows the theme, and switching applies and saves it', () => {
    systemPrefersDark(true);
    render(<ThemeToggle />);
    const toggle = screen.getByRole('switch', { name: 'Giao diện tối' });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleName('Giao diện tối');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('cross-fades colours briefly after a switch', () => {
    vi.useFakeTimers();
    try {
      systemPrefersDark(false);
      render(<ThemeToggle />);
      fireEvent.click(screen.getByRole('switch', { name: 'Giao diện tối' }));
      expect(document.documentElement).toHaveClass(THEME_CHANGING_CLASS);
      vi.advanceTimersByTime(THEME_TRANSITION_MS);
      expect(document.documentElement).not.toHaveClass(THEME_CHANGING_CLASS);
    } finally {
      vi.useRealTimers();
    }
  });

  it('switches without a cross-fade when the viewer prefers reduced motion', () => {
    systemPrefersDark(false, true);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('switch', { name: 'Giao diện tối' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement).not.toHaveClass(THEME_CHANGING_CLASS);
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
    expect(within(header).getByRole('switch', { name: 'Giao diện tối' })).toBeVisible();
  });
});
