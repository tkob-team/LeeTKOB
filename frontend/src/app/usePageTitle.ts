import { useEffect } from 'react';

export const APP_NAME = 'LeeTKOB';

/** "<page> · LeeTKOB". */
export function pageTitle(page: string): string {
  return `${page} · ${APP_NAME}`;
}

/**
 * Sets the browser tab title of the current page, so tabs, history and screen readers tell
 * pages apart. `undefined` leaves the title to a page rendered inside this one (a NotFoundPage
 * shown in place of the content). The title goes back to the app name on unmount.
 */
export function usePageTitle(page: string | undefined): void {
  useEffect(() => {
    if (page !== undefined) document.title = pageTitle(page);
  }, [page]);
  useEffect(
    () => () => {
      document.title = APP_NAME;
    },
    [],
  );
}
