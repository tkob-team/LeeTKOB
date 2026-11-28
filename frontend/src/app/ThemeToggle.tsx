import { useEffect, useSyncExternalStore, type KeyboardEvent } from 'react';
import { applyStoredTheme, chooseTheme, currentTheme, subscribeTheme, type Theme } from './theme';

/** Theme changes from any tab, plus OS changes (they matter while nothing is saved). */
function subscribe(onChange: () => void): () => void {
  const unsubscribe = subscribeTheme(onChange);
  const query =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  query?.addEventListener('change', onChange);
  return () => {
    unsubscribe();
    query?.removeEventListener('change', onChange);
  };
}

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
  // One source of truth: storage (or the operating system without a saved choice). A choice in
  // this tab, a choice in another tab and an OS change all re-render every toggle on the page.
  const theme = useSyncExternalStore(subscribe, currentTheme);

  // <html> follows storage too, in case a change arrived while no toggle was listening (for
  // example while the page switched layouts on sign-out).
  useEffect(() => {
    applyStoredTheme();
  }, []);

  const choose = (next: Theme) => {
    chooseTheme(next);
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
