import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerdictBadge, type Verdict } from './VerdictBadge';

describe('VerdictBadge', () => {
  it.each<[Verdict, string]>([
    ['pass', '✓'],
    ['violation', '✕'],
    ['unsure', '?'],
  ])('renders %s with word, glyph and colour class', (verdict, glyph) => {
    const { container } = render(<VerdictBadge verdict={verdict} />);
    const badge = container.firstElementChild;
    expect(badge).toHaveClass('lk-verdict', `lk-verdict--${verdict}`);
    expect(badge).toHaveTextContent(`${glyph} ${verdict}`);
    expect(screen.getByText(glyph)).toHaveAttribute('aria-hidden', 'true');
  });
});
