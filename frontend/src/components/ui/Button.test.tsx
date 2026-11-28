import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders the variant class and fires onClick', () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Công bố điểm
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Công bố điểm' });
    expect(button).toHaveClass('lk-btn', 'lk-btn--primary');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows the reason as text beside a disabled button', () => {
    render(
      <Button variant="primary" disabled disabledReason="Còn 3 mục trong hàng chờ duyệt">
        Công bố điểm
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Công bố điểm' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveClass('lk-btn--primary');
    expect(button).toHaveAccessibleDescription('Còn 3 mục trong hàng chờ duyệt');
  });

  it('keeps the same <button> and its focus when `disabled` changes (no remount)', () => {
    const view = (disabled: boolean) => (
      <Button disabled={disabled} disabledReason="Đang gửi…">
        Gửi
      </Button>
    );
    const { rerender, container } = render(view(false));
    const button = screen.getByRole('button', { name: 'Gửi' });
    const shape = () => container.innerHTML.replace(/ disabled=""/, '').replace(/>[^<]*</g, '><');
    const enabledShape = shape();
    button.focus();
    expect(button).toHaveFocus();
    expect(screen.queryByText('Đang gửi…')).toBeNull();

    rerender(view(true));
    expect(screen.getByRole('button', { name: 'Gửi' })).toBe(button);
    expect(button).toHaveAccessibleDescription('Đang gửi…');

    rerender(view(false));
    expect(screen.getByRole('button', { name: 'Gửi' })).toBe(button);
    expect(button).toHaveFocus();
    expect(button).not.toHaveAccessibleDescription('Đang gửi…');
    expect(shape()).toBe(enabledShape);
  });

  it('renders a bare <button> when no reason is given', () => {
    const { container } = render(<Button disabled>Gán</Button>);
    expect(container.firstElementChild?.tagName).toBe('BUTTON');
    expect(container.children).toHaveLength(1);
  });

  it('draws a link with the button classes without an underline', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    expect(css).toMatch(/a\.lk-btn\s*\{\s*text-decoration:\s*none;\s*\}/);
  });
});
