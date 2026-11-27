/**
 * Light/dark theme. A theme the viewer chose is kept in localStorage and wins; without one the
 * operating system's `prefers-color-scheme` applies (tokens.css). The choice is written as
 * `data-theme` on <html>; index.html applies it before the first paint to avoid a flash.
 */
export type Theme = 'light' | 'dark';

/** Same key as the inline script in index.html. */
export const THEME_KEY = 'leetkob.theme';

/** A choice made while storage is unavailable; it lasts for this page only. */
let unsavedChoice: Theme | null = null;

/** The saved choice, or null when none was saved (or storage is unavailable and none was made). */
export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return unsavedChoice;
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

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

/**
 * Calls `listener` whenever the theme changes: a choice in this tab, or a choice (or cleared
 * storage) in another tab of the same site, which arrives as a `storage` event. Another tab's
 * choice is applied to <html> here first, so the screen and the buttons never disagree.
 * Returns the unsubscribe function.
 */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_KEY) return;
    applyStoredTheme();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Saves the choice and applies it, cross-fading colours unless the viewer asked for less motion. */
export function chooseTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice still applies to this page.
    unsavedChoice = theme;
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
  notify();
}

/** Applies the saved choice, or removes `data-theme` so the operating system decides. */
export function applyStoredTheme(): void {
  const theme = storedTheme();
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
