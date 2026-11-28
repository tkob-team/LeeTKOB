import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { TaLabsPage } from './TaLabsPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const code = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';

function renderPage() {
  render(
    <MemoryRouter>
      <TaLabsPage />
    </MemoryRouter>,
  );
}

describe('invite code on the TA lab page', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('shows each class invite code from GET /classes with a copy button', async () => {
    request
      .mockResolvedValueOnce([
        { id: 'c1', name: 'CTT1', inviteCode: code },
        { id: 'c2', name: 'CTT2', inviteCode: 'Zz'.repeat(16) },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    renderPage();

    const first = await screen.findByRole('region', { name: 'CTT1' });
    expect(within(first).getByText(code)).toHaveClass('lk-mono');
    expect(within(first).getByRole('button', { name: 'Sao chép mã mời' })).toBeInTheDocument();
    const second = screen.getByRole('region', { name: 'CTT2' });
    expect(within(second).getByText('Zz'.repeat(16))).toBeInTheDocument();
  });

  it('says a legacy class without a code has no invite code', async () => {
    request.mockResolvedValueOnce([{ id: 'c1', name: 'CTT1', inviteCode: null }]);
    request.mockResolvedValueOnce([]);
    renderPage();
    const panel = await screen.findByRole('region', { name: 'CTT1' });
    expect(within(panel).getByText('Lớp này chưa có mã mời.')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Sao chép mã mời' })).toBeNull();
  });
});
