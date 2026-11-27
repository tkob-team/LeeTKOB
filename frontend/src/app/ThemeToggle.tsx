import { useEffect, useState, type KeyboardEvent } from 'react';
import { chooseTheme, currentTheme, storedTheme, type Theme } from './theme';

const OPTIONS: { theme: Theme; label: string }[] = [
  { theme: 'light', label: 'Sáng' },
  { theme: 'dark', label: 'Tối' },
];

/**
 * Light/dark choice as two buttons "Sáng | Tối" (radiogroup): the theme in use is the checked,
 * filled one. Used in the signed-in header and on the login and 404 pages. The choice is
 * remembered in localStorage; without one the operating system's theme applies.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Without a saved choice the screen follows the operating system; keep the buttons in step.
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

  const choose = (next: Theme) => {
    chooseTheme(next);
    setTheme(next);
  };

  // Arrow keys move between the two options, as in any radio group.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    choose(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-theme-option="${next}"]`)?.focus();
  };

  return (
    <div className="lk-theme-choice" role="radiogroup" aria-label="Giao diện" onKeyDown={onKeyDown}>
      {OPTIONS.map((option) => {
        const checked = option.theme === theme;
        return (
          <button
            key={option.theme}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-theme-option={option.theme}
            className="lk-theme-choice__option"
            onClick={() => {
              choose(option.theme);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
