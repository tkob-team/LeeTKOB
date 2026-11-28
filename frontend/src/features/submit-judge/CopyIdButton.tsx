import { useEffect, useState } from 'react';
import { Button, copyText } from '../../components/ui';

/**
 * "Sao chép" for the full submission id behind its 8-character label. The button itself says
 * "Đã sao chép" for 2 s (no extra line, so the row never changes height) and a polite live
 * region repeats it for screen readers. Not a `role="status"` element: the grading result keeps
 * the page's only status region.
 */
export function CopyIdButton({ id }: { id: string }) {
  const [state, setState] = useState<'copied' | 'failed'>();

  useEffect(() => {
    if (!state) return;
    const timer = window.setTimeout(() => {
      setState(undefined);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);

  const text =
    state === 'copied' ? 'Đã sao chép' : state === 'failed' ? 'Không sao chép được' : 'Sao chép';
  return (
    <>
      <Button
        aria-label={`Sao chép mã bài nộp ${id}`}
        onClick={() => {
          void copyText(id).then((ok) => {
            setState(ok ? 'copied' : 'failed');
          });
        }}
      >
        {text}
      </Button>
      <span className="lk-sr-only" aria-live="polite">
        {state ? text : ''}
      </span>
    </>
  );
}
