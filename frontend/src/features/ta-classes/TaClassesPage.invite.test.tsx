import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { TaClassesPage } from './TaClassesPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const code = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';

/** GET /classes plus each class's roster and labs. */
function serve(classes: { id: string; name: string; inviteCode: string | null }[]) {
  request.mockImplementation((path: string) => {
    if (path === '/classes') return Promise.resolve(classes);
    if (path === '/classes/c1/members') {
      return Promise.resolve([
        { id: 't1', role: 'TA' },
        { id: 's1', role: 'STUDENT' },
        { id: 's2', role: 'STUDENT' },
        { id: 's3', role: 'STUDENT' },
      ]);
    }
    if (path === '/classes/c1/labs') return Promise.resolve([{ id: 'l1' }, { id: 'l2' }]);
    if (path.endsWith('/members') || path.endsWith('/labs')) return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function renderPage() {
  render(
    <MemoryRouter>
      <TaClassesPage />
    </MemoryRouter>,
  );
}

describe('"Lớp của tôi" (TA class list)', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('lists each class with student and lab counts, a link and the invite code', async () => {
    serve([
      { id: 'c1', name: 'CTT1', inviteCode: code },
      { id: 'c2', name: 'CTT2', inviteCode: 'Zz'.repeat(16) },
    ]);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Lớp của tôi', level: 1 })).toBeVisible();
    const frame = await screen.findByRole('region', { name: 'Danh sách lớp' });
    const row = await within(frame).findByRole('row', { name: /CTT1/ });
    const cells = within(row).getAllByRole('cell');
    expect(within(row).getByRole('link', { name: 'CTT1' })).toHaveAttribute(
      'href',
      '/ta/classes/c1',
    );
    expect(cells[1]).toHaveTextContent(/^3$/);
    expect(cells[2]).toHaveTextContent(/^2$/);
    expect(within(row).getByText(code)).toHaveClass('lk-mono');
    expect(
      within(row).getByRole('button', { name: 'Sao chép mã mời lớp CTT1' }),
    ).toBeInTheDocument();
    const second = within(frame).getByRole('row', { name: /CTT2/ });
    expect(within(second).getByText('Zz'.repeat(16))).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/classes/c1/members', expect.anything());
  });

  it('says a legacy class without a code has no invite code', async () => {
    serve([{ id: 'c1', name: 'CTT1', inviteCode: null }]);
    renderPage();
    const row = await screen.findByRole('row', { name: /CTT1/ });
    expect(within(row).getByText('Chưa có mã mời')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Sao chép/ })).toBeNull();
  });

  it('says when the TA has no class', async () => {
    serve([]);
    renderPage();
    expect(await screen.findByText('Bạn chưa được phân công trợ giảng lớp nào.')).toBeVisible();
  });
});
