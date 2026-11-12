import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProblemDetails } from '../../api/problem';
import { ProblemAlert } from './ProblemAlert';

const problem: ProblemDetails = {
  type: 'urn:leetkob:problem:lab-closed',
  title: 'Lab is closed',
  status: 409,
  detail: 'The deadline for Sorting lab was 10/11/2026 23:59.',
  instance: '/labs/1/submissions',
};

describe('ProblemAlert', () => {
  it('shows title and detail but hides the type URN from students', () => {
    render(<ProblemAlert problem={problem} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('lk-problem');
    expect(screen.getByText('Lab is closed')).toHaveClass('lk-problem__title');
    expect(screen.getByText(problem.detail ?? '')).toHaveClass('lk-problem__detail');
    expect(alert).not.toHaveTextContent('urn:leetkob');
  });

  it('shows the type URN and status to TAs', () => {
    render(<ProblemAlert problem={problem} showType />);
    expect(screen.getByText('urn:leetkob:problem:lab-closed · 409')).toHaveClass(
      'lk-problem__type',
    );
  });
});
