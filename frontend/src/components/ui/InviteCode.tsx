import { useEffect, useState } from 'react';
import { Button } from './Button';
import { copyText } from './copy-text';

/** How long the button says "Đã sao chép" (or "Chưa sao chép") before it reads "Sao chép" again. */
export const COPIED_MS = 2000;

const LABELS = { idle: 'Sao chép', copied: 'Đã sao chép', failed: 'Chưa sao chép' } as const;
const ANNOUNCE = { copied: 'Đã sao chép mã mời.', failed: 'Không sao chép được mã mời.' } as const;

export interface InviteCodeProps {
  code: string;
  /** Class name, for the button's accessible name "Sao chép mã mời lớp <lớp>". */
  classLabel: string;
}

/**
 * An invite code in mono with one "Sao chép" button. The result shows on the button itself for
 * two seconds; the button is as wide as its longest label, so nothing around it moves. A
 * visually hidden status line tells screen readers. Works on plain HTTP (see copyText).
 */
export function InviteCode({ code, classLabel }: InviteCodeProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => {
      setState('idle');
    }, COPIED_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);

  return (
    <span className="lk-invite">
      <code className="lk-mono">{code}</code>
      <Button
        aria-label={`Sao chép mã mời lớp ${classLabel}`}
        onClick={() => {
          void copyText(code).then((ok) => {
            setState(ok ? 'copied' : 'failed');
          });
        }}
      >
        {/* Every label sits in the same grid cell (two as pseudo-elements), so the width fits
            the longest one whichever is shown. */}
        <span className="lk-swap" data-alt1={LABELS.copied} data-alt2={LABELS.failed}>
          <span>{LABELS[state]}</span>
        </span>
      </Button>
      <span className="lk-sr-only" role="status">
        {state === 'idle' ? '' : ANNOUNCE[state]}
      </span>
    </span>
  );
}
