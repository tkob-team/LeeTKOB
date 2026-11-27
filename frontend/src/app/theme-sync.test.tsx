import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY } from './theme';
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

/** What another tab does: write storage, then the browser fires `storage` in this tab. */
function otherTabWrites(value: string | null) {
  const oldValue = localStorage.getItem(THEME_KEY);
  if (value === null) localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, value);
  act(() => {
    window.dispatchEvent(
      new StorageEvent('storage', { key: THEME_KEY, oldValue, newValue: value }),
    );
  });
}

const checked = () =>
  screen
    .getAllByRole('radio')
    .filter((radio) => radio.getAttribute('aria-checked') === 'true')
    .map((radio) => radio.textContent);

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  systemPrefersDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme across tabs', () => {
  it('follows a choice made in another tab: screen and buttons together', () => {
    render(<ThemeToggle />);
    expect(checked()).toEqual(['Sáng']);

    otherTabWrites('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(checked()).toEqual(['Tối']);

    otherTabWrites('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(checked()).toEqual(['Sáng']);
  });

  it('falls back to the operating system when another tab clears the choice', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    document.documentElement.dataset.theme = 'dark';
    render(<ThemeToggle />);
    otherTabWrites(null);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(checked()).toEqual(['Sáng']);
  });

  it('ignores storage events for other keys', () => {
    render(<ThemeToggle />);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'leetkob.session' }));
    });
    expect(checked()).toEqual(['Sáng']);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('keeps two toggles on one page in step', () => {
    render(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>,
    );
    fireEvent.click(screen.getAllByRole('radio', { name: 'Tối' })[0] as HTMLElement);
    expect(checked()).toEqual(['Tối', 'Tối']);
  });

  it('a toggle mounted after a change elsewhere matches the screen (sign-out case)', () => {
    // The screen still shows light, but another tab saved dark while no toggle listened.
    document.documentElement.dataset.theme = 'light';
    localStorage.setItem(THEME_KEY, 'dark');
    render(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(checked()).toEqual(['Tối']);
  });
});
