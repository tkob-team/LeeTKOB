import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import type { ProblemDetails } from '../../api/problem';
import { Button } from './Button';
import { ProblemAlert } from './ProblemAlert';

export interface ConfirmDialogProps {
  /** Mounted and shown as a modal while true; one dialog at a time. */
  open: boolean;
  /** A question naming its object: "Gỡ Sinh viên 1 khỏi Lớp thử nghiệm 1?". */
  title: string;
  /** One or two sentences on what happens and whether it can be undone. */
  body: ReactNode;
  /** Verb + object ("Gỡ Sinh viên 1"), never "OK". Omit to show only the cancel button. */
  confirmLabel?: string;
  /** Label of the confirm button while `pending` ("Đang gỡ…"). */
  pendingLabel?: string;
  /** "Huỷ" while the action has not run; "Đóng" once there is nothing left to confirm. */
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /**
   * A second way to go ahead, between "Huỷ" and the confirm button ("Thay toàn bộ bằng 5 test
   * mới"); shown only together with `onAlternative`.
   */
  alternativeLabel?: string;
  onAlternative?: () => void;
  /** While true both buttons are locked and Esc or the backdrop do not close the dialog. */
  pending?: boolean;
  /** The failure of the last attempt, shown inside the dialog. */
  problem?: ProblemDetails;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Confirmation for a destructive action, as a native modal `<dialog>` (`showModal()`, never
 * `window.confirm`). The focus starts on the cancel button, stays inside the dialog and returns
 * to the element that opened it. Esc and a click on the backdrop cancel, except while pending.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Huỷ',
  tone = 'danger',
  alternativeLabel,
  onAlternative,
  pending = false,
  problem,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // Open as a modal, focus "Huỷ"; on close give the focus back to the opener if it still exists.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!element.open) element.showModal();
    cancel.current?.focus();
    return () => {
      if (element.open) element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  // A disabled button loses the focus: keep it on the dialog while pending, then back on cancel.
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    if (pending) element.focus();
    else if (!element.contains(document.activeElement) || document.activeElement === element) {
      cancel.current?.focus();
    }
  }, [open, pending]);

  if (!open) return null;

  function requestCancel() {
    if (!pending) onCancel();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el !== event.currentTarget,
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === event.currentTarget)) {
      event.preventDefault();
      first.focus();
    }
  }

  // The browser's own cancel (Esc, a back gesture) is replaced by ours so `pending` is honoured.
  function onNativeCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    requestCancel();
  }

  // A click on the ::backdrop targets the <dialog> itself; the content fills it edge to edge.
  function onClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) requestCancel();
  }

  return (
    <dialog
      ref={dialog}
      className="lk-dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      aria-busy={pending || undefined}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onCancel={onNativeCancel}
      onClick={onClick}
    >
      <div className="lk-dialog__content">
        <h2 id={titleId} className="lk-dialog__title">
          {title}
        </h2>
        <div id={bodyId} className="lk-dialog__body">
          {body}
        </div>
        {problem ? <ProblemAlert problem={problem} /> : null}
        <div className="lk-dialog__actions">
          <Button ref={cancel} disabled={pending} onClick={requestCancel}>
            {cancelLabel}
          </Button>
          {alternativeLabel && onAlternative ? (
            <Button disabled={pending} onClick={onAlternative}>
              {alternativeLabel}
            </Button>
          ) : null}
          {confirmLabel ? (
            <Button variant={tone} disabled={pending} onClick={onConfirm}>
              {pending && pendingLabel ? pendingLabel : confirmLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
