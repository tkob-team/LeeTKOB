import { useLayoutEffect, useRef, useState, type ComponentProps, type Ref } from 'react';

export type PasswordInputProps = Omit<ComponentProps<'input'>, 'type' | 'ref'> & {
  ref?: Ref<HTMLInputElement>;
};

/** Eye with a slash: the password is hidden (shown while `type="password"`). */
function EyeClosedIcon() {
  return (
    <svg
      data-icon="eye-closed"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2" />
      <path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

/** Open eye: the password is shown (`type="text"`). */
function EyeOpenIcon() {
  return (
    <svg
      data-icon="eye-open"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Password field with a show/hide button inside it, on the right. The icon shows the current
 * state: a crossed-out eye while the password is hidden, an open eye while it is shown. The
 * button never submits the form, is reachable with Tab, and a click keeps the focus and the
 * caret where they were in the field. Takes the same props as an input, so FormField can label it.
 */
export function PasswordInput({ ref, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const caret = useRef<{ start: number | null; end: number | null } | null>(null);

  const setInput = (node: HTMLInputElement | null) => {
    input.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  // Changing `type` can move the caret in some browsers; put it back where it was.
  useLayoutEffect(() => {
    const saved = caret.current;
    caret.current = null;
    const field = input.current;
    if (!saved || !field || document.activeElement !== field) return;
    field.setSelectionRange(saved.start, saved.end);
  }, [visible]);

  return (
    <div className="lk-password">
      <input
        {...props}
        ref={setInput}
        type={visible ? 'text' : 'password'}
        className={className ? `lk-password__input ${className}` : 'lk-password__input'}
      />
      <button
        type="button"
        className="lk-password__toggle"
        aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        aria-pressed={visible}
        // A mouse press would move the focus to the button; keep it in the field.
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => {
          const field = input.current;
          if (field && document.activeElement === field) {
            caret.current = { start: field.selectionStart, end: field.selectionEnd };
          }
          setVisible((shown) => !shown);
        }}
      >
        {visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
      </button>
    </div>
  );
}
