import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COPIED_MS, InviteCode } from './InviteCode';

const code = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.useRealTimers();
});

describe('InviteCode', () => {
  it('shows the code in mono and one "Sao chép" button named after the class', () => {
    render(<InviteCode code={code} classLabel="Web nâng cao" />);
    expect(screen.getByText(code)).toHaveClass('lk-mono');
    const button = screen.getByRole('button', { name: 'Sao chép mã mời lớp Web nâng cao' });
    expect(button).toHaveTextContent(/^Sao chép$/);
  });

  it('says "Đã sao chép" on the button for 2 s and announces it to screen readers', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<InviteCode code={code} classLabel="Web" />);
    const button = screen.getByRole('button', { name: 'Sao chép mã mời lớp Web' });

    fireEvent.click(button);
    await act(async () => {
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(code);
    expect(button).toHaveTextContent(/^Đã sao chép$/);
    expect(screen.getByRole('status')).toHaveTextContent('Đã sao chép mã mời.');
    expect(screen.getByRole('status')).toHaveClass('lk-sr-only');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COPIED_MS + 100);
    });
    expect(button).toHaveTextContent(/^Sao chép$/);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('keeps every label in the same cell, so the button never changes width', () => {
    render(<InviteCode code={code} classLabel="Web" />);
    const swap = screen.getByText('Sao chép').parentElement as HTMLElement;
    expect(swap).toHaveClass('lk-swap');
    expect(swap.dataset).toMatchObject({ alt1: 'Đã sao chép', alt2: 'Chưa sao chép' });
  });

  it('says "Chưa sao chép" when the copy fails', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.reject(new Error('no')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<InviteCode code={code} classLabel="Web" />);
    const button = screen.getByRole('button', { name: 'Sao chép mã mời lớp Web' });
    fireEvent.click(button);
    expect(await screen.findByText('Chưa sao chép')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Không sao chép được mã mời.');
  });
});
