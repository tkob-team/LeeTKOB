import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from './FormField';

describe('FormField', () => {
  it('labels the control and links the help text', () => {
    render(
      <FormField label="Thời gian CPU mỗi test" help="1 đến 5 giây.">
        <input defaultValue="1 s" />
      </FormField>,
    );
    const input = screen.getByLabelText('Thời gian CPU mỗi test');
    expect(input).toHaveAccessibleDescription('1 đến 5 giây.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('shows the error instead of help and marks the control invalid', () => {
    const { container } = render(
      <FormField label="Khoản trừ" help="0 đến 10." error="Phải từ 0 đến 10.">
        <input id="deduction" defaultValue="12" />
      </FormField>,
    );
    expect(container.firstElementChild).toHaveClass('lk-field', 'lk-field--error');
    const input = screen.getByLabelText('Khoản trừ');
    expect(input).toHaveAttribute('id', 'deduction');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Phải từ 0 đến 10.');
    expect(screen.queryByText('0 đến 10.')).toBeNull();
  });
});
