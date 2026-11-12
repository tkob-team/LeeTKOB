export type JudgeCode = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'pending';

export interface JudgeResultProps {
  code: JudgeCode;
}

function modifier(code: JudgeCode): 'ac' | 'fail' | 'pending' {
  if (code === 'AC') return 'ac';
  if (code === 'pending') return 'pending';
  return 'fail';
}

/** The code is always printed, so colour is never the only signal. */
export function JudgeResult({ code }: JudgeResultProps) {
  return <span className={`lk-judge lk-judge--${modifier(code)}`}>{code}</span>;
}
