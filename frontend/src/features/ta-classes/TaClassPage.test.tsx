import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { TaLayout } from '../../app/AppLayout';
import { AuthContext, type AuthState } from '../../app/auth-context';
import type { LabSummary } from '../lab-authoring/lab-api';
import { ToastProvider } from '../../components/ui';
import { TaClassPage } from './TaClassPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const labId = '8f2d1c34-5e6a-4f7b-9c10-1a2b3c4d5e6f';
const classId = '1b2c3d4e-0000-4000-8000-000000000001';
const code = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';

const lab: LabSummary = {
  id: labId,
  title: 'Sorting with merge sort',
  opensAt: '2026-11-24T01:00:00.000Z',
  dueAt: '2026-12-01T16:59:59.000Z',
  cpuTimeMs: 1000,
  memoryMb: 256,
  testCount: 7,
  constraintCount: 2,
  submissionCount: 12,
  studentsSubmitted: 5,
};

const auth: AuthState = {
  session: { token: 't', role: 'ta', email: 'ta@x', displayName: 'TA' },
  login: vi.fn(),
  logout: vi.fn(),
};

/** GET /classes/{id}, its roster and its labs. */
function serve({
  name = 'CTT1',
  labs = [lab],
  roster = [
    { id: 't1', role: 'TA' },
    { id: 's1', role: 'STUDENT' },
    { id: 's2', role: 'STUDENT' },
  ],
  inviteCode = code,
} = {}) {
  request.mockImplementation((path: string) => {
    if (path === `/classes/${classId}`) return Promise.resolve({ id: classId, name, inviteCode });
    if (path === `/classes/${classId}/members`) return Promise.resolve(roster);
    if (path === `/classes/${classId}/labs`) return Promise.resolve(labs);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function renderPage(state?: unknown) {
  render(
    <AuthContext value={auth}>
      <ToastProvider>
        <MemoryRouter initialEntries={[{ pathname: `/ta/classes/${classId}`, state }]}>
          <Routes>
            <Route path="/ta/classes/:classId" element={<TaClassPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext>,
  );
}

describe('TA class page', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('lists the labs of the class with a link to each review queue', async () => {
    serve();
    renderPage();

    const panel = await screen.findByRole('region', { name: 'Lab và hàng chờ duyệt' });
    const row = within(panel).getByRole('row', { name: /Sorting with merge sort/ });
    expect(row).toHaveTextContent('12 bài · 5 sinh viên');
    expect(
      within(row).getByRole('link', { name: 'Hàng chờ duyệt: Sorting with merge sort' }),
    ).toHaveAttribute('href', `/ta/labs/${labId}/review`);
    expect(request).toHaveBeenCalledWith(`/classes/${classId}/labs`, expect.anything());
  });

  it('puts "Tạo lab" on the title row, after the name, whatever its length', async () => {
    const name =
      'Phát triển ứng dụng web nâng cao — lớp chiều thứ Năm, phòng máy tầng ba, học kỳ một năm học 2026–2027';
    serve({ name });
    renderPage();
    const heading = await screen.findByRole('heading', { name, level: 1 });
    const create = screen.getByRole('link', { name: 'Tạo lab' });
    expect(create).toHaveAttribute('href', `/ta/classes/${classId}/labs/new`);
    const row = heading.parentElement;
    expect(row).toHaveClass('lk-title-row');
    expect(create.parentElement).toBe(row);
    expect(row?.lastElementChild).toBe(create);

    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    expect(css).toMatch(/\.lk-title-row \{[^}]*display: flex;[^}]*justify-content: space-between;/);
    expect(css).toMatch(/\.lk-title-row > \.lk-page__title \{[^}]*overflow-wrap: anywhere;/);
    expect(css).toMatch(/\.lk-title-row > \.lk-btn \{[^}]*flex: 0 0 auto;/);
  });

  it('shows the invite code with a copy button and the TA and student counts', async () => {
    serve();
    renderPage();
    expect(await screen.findByText(code)).toHaveClass('lk-mono');
    expect(screen.getByRole('button', { name: 'Sao chép mã mời lớp CTT1' })).toHaveTextContent(
      /^Sao chép$/,
    );
    expect(screen.getByText('1 trợ giảng · 2 sinh viên')).toBeInTheDocument();
  });

  it('keeps the server order (latest opening first) and says when there is no lab', async () => {
    const newer = { ...lab, id: 'newer', title: 'Lab 2', opensAt: '2026-12-01T01:00:00.000Z' };
    serve({ labs: [newer, lab] });
    renderPage();
    const panel = await screen.findByRole('region', { name: 'Lab và hàng chờ duyệt' });
    const [, first, second] = within(panel).getAllByRole('row');
    expect(first).toHaveTextContent('Lab 2');
    expect(second).toHaveTextContent('Sorting with merge sort');
  });

  it('says the class has no lab yet', async () => {
    serve({ labs: [] });
    renderPage();
    expect(await screen.findByText('Lớp này chưa có lab.')).toBeInTheDocument();
  });

  it('says which lab was just created when coming back from the create page', async () => {
    serve();
    renderPage({ created: 'Sorting with merge sort' });
    const toasts = screen.getByRole('status', { name: 'Thông báo' });
    expect(
      await within(toasts).findByText('Đã tạo lab Sorting with merge sort.'),
    ).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'CTT1', level: 1 });
    expect(within(toasts).getAllByText('Đã tạo lab Sorting with merge sort.')).toHaveLength(1);
    expect(
      screen.getByRole('region', { name: 'CTT1' }).querySelector('p[role="status"]'),
    ).toBeNull();
  });

  it('shows the 404 page for a class the TA does not teach', async () => {
    request.mockRejectedValue(
      new ApiProblemError({
        type: 'urn:leetkob:problem:class-not-found',
        title: 'Class not found',
        status: 404,
      }),
    );
    renderPage();
    expect(await screen.findByText('Không tìm thấy trang')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về danh sách lab' })).toHaveAttribute(
      'href',
      '/ta/classes',
    );
    expect(screen.queryByText('Class not found')).toBeNull();
  });

  it.each([
    '/ta/classes',
    `/ta/classes/${classId}`,
    `/ta/classes/${classId}/labs/new`,
    `/ta/labs/${labId}/review`,
    '/ta/review-queue',
  ])('marks the navigation link "Lớp của tôi" as the current page on %s', (path) => {
    render(
      <AuthContext value={auth}>
        <MemoryRouter initialEntries={[path]}>
          <TaLayout />
        </MemoryRouter>
      </AuthContext>,
    );
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    const link = within(nav).getByRole('link', { name: 'Lớp của tôi' });
    expect(link).toHaveAttribute('href', '/ta/classes');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('link', { name: 'Hàng chờ duyệt' })).toBeNull();
  });

  it('writes the lab title on each review-queue button, not only in its accessible name', async () => {
    serve();
    renderPage();
    const link = await screen.findByRole('link', {
      name: 'Hàng chờ duyệt: Sorting with merge sort',
    });
    expect(link).toHaveTextContent('Hàng chờ duyệt: Sorting with merge sort');
    expect(link).not.toHaveAttribute('aria-label');
  });

  it('wraps a long lab title (~120 characters) in its cell and in the queue button', async () => {
    const title =
      'Lab 7: sắp xếp trộn có đếm số lần đổi chỗ, đọc dữ liệu lớn từ bàn phím và in kết quả theo đúng định dạng đề yêu cầu';
    expect(title.length).toBeGreaterThanOrEqual(110);
    serve({ labs: [{ ...lab, title }] });
    renderPage();
    const link = await screen.findByRole('link', { name: `Hàng chờ duyệt: ${title}` });
    const row = link.closest('tr');
    if (!row) throw new Error('expected a table row');
    const [titleCell] = within(row).getAllByRole('cell');
    expect(titleCell).toHaveTextContent(title);
    expect(titleCell).toHaveClass('lk-wrap');
    expect(link.closest('td')).toHaveClass('lk-wrap');

    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    expect(css).toMatch(
      /\.lk-table td\.lk-wrap \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/,
    );
    expect(css).toMatch(/\.lk-table td\.lk-wrap \.lk-btn \{[^}]*white-space: normal;/);
  });
});
