import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

/** A page with an opener button and the dialog it opens. */
function Harness({
  pending = false,
  onConfirm = vi.fn(),
  problem,
}: {
  pending?: boolean;
  onConfirm?: () => void;
  problem?: { type: string; title: string; status: number };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Gỡ An
      </button>
      <ConfirmDialog
        open={open}
        title="Gỡ An khỏi Web?"
        body={<p>An sẽ không còn thấy lab của lớp này.</p>}
        confirmLabel="Gỡ An"
        pendingLabel="Đang gỡ…"
        pending={pending}
        problem={problem}
        onConfirm={onConfirm}
        onCancel={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

function openDialog() {
  const opener = screen.getByRole('button', { name: 'Gỡ An' });
  opener.focus();
  fireEvent.click(opener);
  return { opener, dialog: screen.getByRole('dialog', { name: 'Gỡ An khỏi Web?' }) };
}

describe('ConfirmDialog', () => {
  it('opens as a modal <dialog> named by its title, described by its body, focus on "Huỷ"', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<Harness />);
    const { dialog } = openDialog();

    expect(dialog.tagName).toBe('DIALOG');
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAccessibleDescription('An sẽ không còn thấy lab của lớp này.');
    expect(screen.getByRole('button', { name: 'Huỷ' })).toHaveFocus();
    const buttons = Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent);
    expect(buttons).toEqual(['Huỷ', 'Gỡ An']);
    expect(dialog.querySelectorAll('button')[1]).toHaveClass('lk-btn--danger');
    expect(confirmSpy).not.toHaveBeenCalled();
    showModal.mockRestore();
    confirmSpy.mockRestore();
  });

  it('keeps the focus inside: Tab from the last button wraps to "Huỷ", Shift+Tab back', () => {
    render(<Harness />);
    const { dialog } = openDialog();
    const cancel = screen.getByRole('button', { name: 'Huỷ' });
    const confirm = dialog.querySelectorAll('button')[1] as HTMLButtonElement;

    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it('cancels on Esc and gives the focus back to the opener', () => {
    render(<Harness />);
    const { opener, dialog } = openDialog();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('cancels on a click on the backdrop but not on a click inside the content', () => {
    render(<Harness />);
    const { opener, dialog } = openDialog();
    fireEvent.click(screen.getByText('An sẽ không còn thấy lab của lớp này.'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('cancels on "Huỷ" and on the browser\'s own cancel event', () => {
    render(<Harness />);
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    const { dialog } = openDialog();
    const cancelEvent = new Event('cancel', { cancelable: true });
    act(() => {
      dialog.dispatchEvent(cancelEvent);
    });
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('while pending: buttons locked, "Đang gỡ…", Esc and backdrop do nothing', () => {
    const { rerender } = render(<Harness />);
    const { dialog } = openDialog();
    rerender(<Harness pending />);

    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đang gỡ…' })).toBeDisabled();
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(dialog);
    const cancelEvent = new Event('cancel', { cancelable: true });
    act(() => {
      dialog.dispatchEvent(cancelEvent);
    });
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog).toHaveFocus();
  });

  it('calls onConfirm and shows a problem inside the dialog', () => {
    const onConfirm = vi.fn();
    render(
      <Harness
        onConfirm={onConfirm}
        problem={{
          type: 'urn:x',
          title: 'An đã có bài nộp trong lớp nên chưa gỡ được.',
          status: 409,
        }}
      />,
    );
    const { dialog } = openDialog();
    fireEvent.click(dialog.querySelectorAll('button')[1] as HTMLButtonElement);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'An đã có bài nộp trong lớp nên chưa gỡ được.',
    );
    expect(dialog).toContainElement(screen.getByRole('alert'));
  });

  it('shows only the cancel button when there is nothing to confirm', () => {
    render(
      <ConfirmDialog
        open
        title="Gỡ An khỏi Web?"
        body="—"
        cancelLabel="Đóng"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Đóng']);
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveFocus();
  });
});

describe('ConfirmDialog with a second way to go ahead', () => {
  it('puts the alternative between "Huỷ" and the confirm button and locks it while pending', () => {
    const onAlternative = vi.fn();
    const onConfirm = vi.fn();
    const props = {
      open: true,
      title: 'Ghi đè test trùng số?',
      body: <p>5 test trùng số (01–05) sẽ bị ghi đè; 2 test cũ (06, 07) vẫn giữ.</p>,
      confirmLabel: 'Ghi đè 01–05, giữ 06–07',
      alternativeLabel: 'Thay toàn bộ bằng 5 test mới',
      onAlternative,
      onConfirm,
      onCancel: vi.fn(),
    };
    const { rerender } = render(<ConfirmDialog {...props} />);
    const dialog = screen.getByRole('dialog', { name: 'Ghi đè test trùng số?' });
    const labels = Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual(['Huỷ', 'Thay toàn bộ bằng 5 test mới', 'Ghi đè 01–05, giữ 06–07']);
    fireEvent.click(screen.getByRole('button', { name: 'Thay toàn bộ bằng 5 test mới' }));
    expect(onAlternative).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    rerender(<ConfirmDialog {...props} pending />);
    expect(screen.getByRole('button', { name: 'Thay toàn bộ bằng 5 test mới' })).toBeDisabled();
  });

  it('shows no alternative without its handler', () => {
    render(
      <ConfirmDialog
        open
        title="Thay đề bài đang có?"
        body="Đề bài sẽ bị thay."
        confirmLabel="Thay đề bài"
        alternativeLabel="Không dùng"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Không dùng' })).toBeNull();
  });
});
