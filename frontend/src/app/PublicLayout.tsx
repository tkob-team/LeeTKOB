import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';

/**
 * Frame of pages shown without the app header (login, 404): the same theme switch as the
 * signed-in header, in the top right corner.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lk-public">
      <header className="lk-public__bar">
        <ThemeToggle />
      </header>
      {children}
    </div>
  );
}
