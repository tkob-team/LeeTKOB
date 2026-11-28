import { useEffect, useState } from 'react';
import { Button } from './Button';
import { copyText } from './copy-text';

export interface CopyButtonProps {
  /** Returns the text at click time, so the button can copy what is rendered. */
  getText: () => string;
  label?: string;
  /** Accessible name when several copy buttons share one visible label (a table of codes). */
  ariaLabel?: string;
}

/** "Sao chép" with a short status message; works on plain HTTP too (see copyText). */
export function CopyButton({ getText, label = 'Sao chép', ariaLabel }: CopyButtonProps) {
  const [status, setStatus] = useState<'copied' | 'failed'>();

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => {
      setStatus(undefined);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [status]);

  return (
    <span className="lk-copy">
      <Button
        aria-label={ariaLabel}
        onClick={() => {
          void copyText(getText()).then((ok) => {
            setStatus(ok ? 'copied' : 'failed');
          });
        }}
      >
        {label}
      </Button>
      <span className="lk-copy__status" role="status">
        {status === 'copied' ? 'Đã sao chép' : status === 'failed' ? 'Không sao chép được' : ''}
      </span>
    </span>
  );
}
