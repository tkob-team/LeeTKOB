import type { ReactNode } from 'react';
import { usePageTitle } from './usePageTitle';

/** Sets the tab title for a page that does not set its own (usePageTitle). */
export function PageTitle({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(title);
  return <>{children}</>;
}
