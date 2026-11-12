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
});
