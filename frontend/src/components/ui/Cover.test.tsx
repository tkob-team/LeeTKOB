import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Cover } from './Cover';

describe('Cover', () => {
  it('shows the product name and tagline with decorative art hidden', () => {
    const { container } = render(<Cover tagline="Bằng chứng trước, điểm sau." />);
    expect(screen.getByText('LeeTKOB')).toHaveClass('lk-cover__name');
    expect(screen.getByText('Bằng chứng trước, điểm sau.')).toHaveClass('lk-cover__tag');
    expect(container.querySelector('.lk-cover__art')).toHaveAttribute('aria-hidden', 'true');
  });
});
