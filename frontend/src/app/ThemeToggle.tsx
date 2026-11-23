import { useEffect, useState } from 'react';
import { Button } from '../components/ui';
import { chooseTheme, currentTheme, storedTheme, type Theme } from './theme';

/** Switches between light and dark and remembers the choice in localStorage. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Without a saved choice the screen follows the operating system; keep the label in step.
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

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <Button
      aria-label={next === 'dark' ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng'}
      onClick={() => {
        chooseTheme(next);
        setTheme(next);
      }}
    >
      {next === 'dark' ? 'Giao diện tối' : 'Giao diện sáng'}
    </Button>
  );
}
