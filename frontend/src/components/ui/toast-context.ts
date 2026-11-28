import { createContext, useContext } from 'react';

export interface ToastApi {
  /** Shows a success message ("Đã …" plus its object). Errors stay next to their cause. */
  show: (message: string) => void;
}

/**
 * Without a ToastProvider (a component rendered alone in a test) messages are dropped; the app
 * mounts one provider at its root (main.tsx).
 */
export const ToastContext = createContext<ToastApi>({
  show: () => undefined,
});

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
