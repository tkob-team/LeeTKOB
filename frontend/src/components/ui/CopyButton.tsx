import { useEffect, useState } from 'react';
import { Button } from './Button';
import { copyText } from './copy-text';

export interface CopyButtonProps {
  /** Returns the text at click time, so the button can copy what is rendered. */
  getText: () => string;
  label?: string;
}

/** "Sao chép" with a short status message; works on plain HTTP too (see copyText). */
export function CopyButton({ getText, label = 'Sao chép' }: CopyButtonProps) {
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
