import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastApi } from './toast-context';

/** How long a toast stays when nobody points at or focuses it. */
export const TOAST_MS = 5000;
/** At most this many toasts are stacked; a new one pushes out the oldest. */
export const TOAST_MAX = 3;

interface ToastItem {
  id: number;
  message: string;
}

/**
 * One success message: hides itself after TOAST_MS, the countdown pauses while the pointer is
 * over it or the focus is inside it, and "Đóng" removes it at once.
 */
function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(TOAST_MS);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => {
      onDismiss(item.id);
    }, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [paused, item.id, onDismiss]);

  return (
    <div
      className="lk-toast"
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <p className="lk-toast__message">{item.message}</p>
      <button
        type="button"
        className="lk-toast__close"
        aria-label={`Đóng thông báo: ${item.message}`}
        onClick={() => {
          onDismiss(item.id);
        }}
      >
        Đóng
      </button>
    </div>
  );
}

/**
 * Success messages in one polite live region at the bottom right (full width on phones). The
 * region is always in the page so screen readers announce what is added to it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show: (message: string) => {
        const id = nextId.current++;
        setItems((current) => [...current, { id, message }].slice(-TOAST_MAX));
      },
    }),
    [],
  );

  return (
    <ToastContext value={api}>
      {children}
      <div className="lk-toasts" role="status" aria-live="polite" aria-label="Thông báo">
        {items.map((item) => (
          <Toast key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  );
}
