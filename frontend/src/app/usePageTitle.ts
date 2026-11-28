import { useLayoutEffect } from 'react';

export const APP_NAME = 'LeeTKOB';

/** "<page> · LeeTKOB". */
export function pageTitle(page: string): string {
  return `${page} · ${APP_NAME}`;
}

/**
 * Sets the browser tab title of the current page, so tabs, history and screen readers tell
 * pages apart. `undefined` leaves the title to a page rendered inside this one (a NotFoundPage
 * shown in place of the content). Update before paint so the title matches the screen
 * as soon as it appears. The title goes back to the app name on unmount.
 */
export function usePageTitle(page: string | undefined): void {
  useLayoutEffect(() => {
    if (page !== undefined) document.title = pageTitle(page);
  }, [page]);
  useLayoutEffect(
    () => () => {
      document.title = APP_NAME;
    },
    [],
  );
}
