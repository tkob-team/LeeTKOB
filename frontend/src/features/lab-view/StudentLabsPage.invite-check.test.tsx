import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { inviteCodeError } from './invite-code';
import { StudentLabsPage } from './StudentLabPage';
import { ToastProvider } from '../../components/ui';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const code = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';

function renderPage() {
  render(
    <ToastProvider>
      <MemoryRouter>
        <StudentLabsPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const joinCalls = () => request.mock.calls.filter(([path]) => path === '/classes/join');

describe('invite code checked on the client (A13)', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockImplementation((path: string) =>
      Promise.resolve(path === '/classes/join' ? { id: 'c1', name: 'CTT1' } : []),
    );
  });

  it('reports a malformed code under the field with its length, and sends nothing', async () => {
    renderPage();
    const input = await screen.findByLabelText('Mã mời');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào lớp' }));
    expect(input).toHaveAccessibleDescription(
      'Mã mời gồm đúng 32 ký tự (chữ, số, - và _). Bạn đã nhập 3 ký tự.',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(joinCalls()).toHaveLength(0);
  });

  it('rejects 32 characters outside the alphabet', async () => {
    renderPage();
    const input = await screen.findByLabelText('Mã mời');
    fireEvent.change(input, { target: { value: `${code.slice(0, 31)}!` } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào lớp' }));
    expect(input).toHaveAccessibleDescription(/Bạn đã nhập 32 ký tự\.$/);
    expect(joinCalls()).toHaveLength(0);
  });

  it('drops the field error as soon as the code is edited', async () => {
    renderPage();
    const input = await screen.findByLabelText('Mã mời');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vào lớp' }));
    fireEvent.change(input, { target: { value: 'abcd' } });
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('trims spaces and line breaks around a pasted code', async () => {
    renderPage();
    const input = await screen.findByLabelText('Mã mời');
    fireEvent.paste(input, { clipboardData: { getData: () => `  ${code}\n` } });
    expect(input).toHaveValue(code);
    fireEvent.click(screen.getByRole('button', { name: 'Vào lớp' }));
    expect(await screen.findByText('Đã vào lớp CTT1.')).toBeInTheDocument();
    expect(joinCalls()[0]?.[1]).toMatchObject({ body: JSON.stringify({ inviteCode: code }) });
  });
});

describe('inviteCodeError', () => {
  it.each([
    ['', 'Nhập mã mời.'],
    [code, undefined],
    ['x'.repeat(31), 'Mã mời gồm đúng 32 ký tự (chữ, số, - và _). Bạn đã nhập 31 ký tự.'],
    ['x'.repeat(33), 'Mã mời gồm đúng 32 ký tự (chữ, số, - và _). Bạn đã nhập 33 ký tự.'],
  ])('"%s" → %s', (value, expected) => {
    expect(inviteCodeError(value)).toBe(expected);
  });
});
