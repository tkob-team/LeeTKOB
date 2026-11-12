import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  children: ReactNode;
}

/** Page title in the `display` style plus one explanatory sentence. */
export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <section className="lk-empty">
      <h1 className="lk-empty__title">{title}</h1>
      <p className="lk-empty__text">{children}</p>
    </section>
  );
}
