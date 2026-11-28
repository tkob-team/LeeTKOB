import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_MS, ToastProvider } from './Toast';
import { useToast } from './toast-context';

function Trigger() {
  const toast = useToast();
  const n = useRef(0);
  return (
    <button
      type="button"
      onClick={() => {
        n.current += 1;
        toast.show(`Đã gỡ sinh viên ${String(n.current)}.`);
      }}
    >
      Gỡ
    </button>
  );
}

function renderWithToasts() {
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
  return {
    region: screen.getByRole('status', { name: 'Thông báo' }),
    show: () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gỡ' }));
    },
  };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the message in a polite live region that is always in the page', () => {
    const { region, show } = renderWithToasts();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
    show();
    expect(within(region).getByText('Đã gỡ sinh viên 1.')).toBeInTheDocument();
  });

  it('hides itself after 5 seconds', () => {
    const { region, show } = renderWithToasts();
    show();
    advance(TOAST_MS - 100);
    expect(within(region).getByText('Đã gỡ sinh viên 1.')).toBeInTheDocument();
    advance(200);
    expect(within(region).queryByText('Đã gỡ sinh viên 1.')).toBeNull();
  });

  it('pauses the countdown while the pointer is over it, and resumes with the time left', () => {
    const { region, show } = renderWithToasts();
    show();
    advance(3000);
    const toast = within(region).getByText('Đã gỡ sinh viên 1.').parentElement as HTMLElement;
    fireEvent.mouseEnter(toast);
    advance(10_000);
    expect(within(region).getByText('Đã gỡ sinh viên 1.')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    advance(1900);
    expect(within(region).getByText('Đã gỡ sinh viên 1.')).toBeInTheDocument();
    advance(200);
    expect(within(region).queryByText('Đã gỡ sinh viên 1.')).toBeNull();
  });

  it('pauses while the focus is inside it', () => {
    const { region, show } = renderWithToasts();
    show();
    const close = within(region).getByRole('button', {
      name: 'Đóng thông báo: Đã gỡ sinh viên 1.',
    });
    act(() => {
      close.focus();
    });
    advance(TOAST_MS * 3);
    expect(within(region).getByText('Đã gỡ sinh viên 1.')).toBeInTheDocument();
    act(() => {
      close.blur();
    });
    advance(TOAST_MS + 100);
    expect(within(region).queryByText('Đã gỡ sinh viên 1.')).toBeNull();
  });

  it('closes at once with "Đóng"', () => {
    const { region, show } = renderWithToasts();
    show();
    const close = within(region).getByRole('button', {
      name: 'Đóng thông báo: Đã gỡ sinh viên 1.',
    });
    expect(close).toHaveTextContent('Đóng');
    fireEvent.click(close);
    expect(region).toBeEmptyDOMElement();
  });

  it('stacks at most 3: a fourth pushes out the oldest', () => {
    const { region, show } = renderWithToasts();
    show();
    show();
    show();
    show();
    expect(
      Array.from(region.querySelectorAll('.lk-toast__message')).map((p) => p.textContent),
    ).toEqual(['Đã gỡ sinh viên 2.', 'Đã gỡ sinh viên 3.', 'Đã gỡ sinh viên 4.']);
  });

  it('drops messages silently when no provider is mounted', () => {
    render(<Trigger />);
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Gỡ' }));
    }).not.toThrow();
    expect(screen.queryByText(/Đã gỡ/)).toBeNull();
  });
});
