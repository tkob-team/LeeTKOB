export type JudgeCode = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'pending';

export interface JudgeResultProps {
  code: JudgeCode;
  /** `large` for the overall result of a submission, so it stands out from per-test codes. */
  size?: 'default' | 'large';
}

function modifier(code: JudgeCode): 'ac' | 'fail' | 'pending' {
  if (code === 'AC') return 'ac';
  if (code === 'pending') return 'pending';
  return 'fail';
}

/** The code is always printed, so colour is never the only signal. */
export function JudgeResult({ code, size = 'default' }: JudgeResultProps) {
  const large = size === 'large' ? ' lk-judge--large' : '';
  return <span className={`lk-judge lk-judge--${modifier(code)}${large}`}>{code}</span>;
}
