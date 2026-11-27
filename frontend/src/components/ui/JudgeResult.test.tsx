import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JudgeResult, type JudgeCode } from './JudgeResult';

describe('JudgeResult', () => {
  it.each<[JudgeCode, string]>([
    ['AC', 'lk-judge--ac'],
    ['WA', 'lk-judge--fail'],
    ['TLE', 'lk-judge--fail'],
    ['MLE', 'lk-judge--fail'],
    ['RE', 'lk-judge--fail'],
    ['CE', 'lk-judge--fail'],
    ['pending', 'lk-judge--pending'],
  ])('prints %s with class %s', (code, modifier) => {
    render(<JudgeResult code={code} />);
    expect(screen.getByText(code)).toHaveClass('lk-judge', modifier);
    expect(screen.getByText(code)).not.toHaveClass('lk-judge--large');
  });

  it('has a large size for the overall result', () => {
    render(<JudgeResult code="WA" size="large" />);
    expect(screen.getByText('WA')).toHaveClass('lk-judge', 'lk-judge--fail', 'lk-judge--large');
  });
});
