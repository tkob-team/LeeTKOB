import { useEffect, useState } from 'react';
import { chooseTheme, currentTheme, storedTheme, type Theme } from './theme';

function SunIcon() {
  return (
    <svg className="lk-theme-switch__icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="lk-theme-switch__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
    </svg>
  );
}

/**
 * Light/dark switch: on = dark. The label never changes, so the width stays fixed and the state
 * is read from the switch itself. The choice is remembered in localStorage.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Without a saved choice the screen follows the operating system; keep the switch in step.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => {
      if (!storedTheme()) setTheme(query.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', follow);
    return () => {
      query.removeEventListener('change', follow);
    };
  }, []);

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      className="lk-theme-switch"
      onClick={() => {
        const next: Theme = dark ? 'light' : 'dark';
        chooseTheme(next);
        setTheme(next);
      }}
    >
      <span className="lk-theme-switch__label">Giao diện tối</span>
      <span className="lk-theme-switch__track" aria-hidden="true">
        <span className="lk-theme-switch__thumb">{dark ? <MoonIcon /> : <SunIcon />}</span>
      </span>
    </button>
  );
}
