import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shown as text beside a disabled button; a button is never disabled without saying why. */
  disabledReason?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  disabled = false,
  disabledReason,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const reasonId = useId();
  const showReason = disabled && disabledReason !== undefined;
  const classes = ['lk-btn', disabled ? '' : `lk-btn--${variant}`, className ?? '']
    .filter(Boolean)
    .join(' ');
  const button = (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled}
      aria-describedby={showReason ? reasonId : rest['aria-describedby']}
    >
      {children}
    </button>
  );
  // The DOM shape depends only on whether a reason is given, never on `disabled`: switching
  // `disabled` must not remount the <button>, which would drop the keyboard focus.
  if (disabledReason === undefined) return button;
  return (
    <span className="lk-btn-group">
      {button}
      <span id={reasonId} className="lk-btn-reason" hidden={!showReason}>
        {showReason ? disabledReason : null}
      </span>
    </span>
  );
}
