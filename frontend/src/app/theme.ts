/**
 * Light/dark theme. A theme the viewer chose is kept in localStorage and wins; without one the
 * operating system's `prefers-color-scheme` applies (tokens.css). The choice is written as
 * `data-theme` on <html>; index.html applies it before the first paint to avoid a flash.
 */
export type Theme = 'light' | 'dark';

/** Same key as the inline script in index.html. */
export const THEME_KEY = 'leetkob.theme';

/** The saved choice, or null when none was saved or storage is unavailable. */
export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** The theme on screen: the saved choice, else the operating system's. */
export function currentTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** Class on <html> while colours cross-fade after a switch (shell.css). */
export const THEME_CHANGING_CLASS = 'lk-theme-changing';

/** Slightly longer than the 200ms colour transition in shell.css. */
export const THEME_TRANSITION_MS = 250;

let transitionTimer: ReturnType<typeof setTimeout> | undefined;

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Saves the choice and applies it, cross-fading colours unless the viewer asked for less motion. */
export function chooseTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice still applies to this page.
  }
  const root = document.documentElement;
  if (!reducedMotion()) {
    root.classList.add(THEME_CHANGING_CLASS);
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
      root.classList.remove(THEME_CHANGING_CLASS);
    }, THEME_TRANSITION_MS);
  }
  root.dataset.theme = theme;
}

/** Applies the saved choice, or removes `data-theme` so the operating system decides. */
export function applyStoredTheme(): void {
  const theme = storedTheme();
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
