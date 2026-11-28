import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { ToastProvider } from '../../components/ui';
import type { AdminClass } from './admin-api';
import { AdminClassesPage } from './AdminClassesPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const classId = '1b2c3d4e-0000-4000-8000-000000000001';
const otherId = '1b2c3d4e-0000-4000-8000-000000000002';
const code = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';
const anna = { id: 'ta-anna', email: 'anna.ta@truong.edu.vn', displayName: 'Anna Trợ giảng' };
const binh = { id: 'ta-binh', email: 'binh.ta@truong.edu.vn', displayName: 'Bình Trợ giảng' };

const web: AdminClass = {
  id: classId,
  name: 'Web nâng cao',
  inviteCode: code,
  tas: [anna, binh],
  studentCount: 3,
};
const algo: AdminClass = {
  id: otherId,
  name: 'Algorithms',
  inviteCode: 'Zz'.repeat(16),
  tas: [],
  studentCount: 0,
};

type Handler = (init: RequestInit | undefined) => unknown;

/** Routes each `api.request(path, init)` to a handler by "METHOD path". */
function serve(handlers: Record<string, Handler>) {
  request.mockImplementation((path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = handlers[key];
    if (!handler) return Promise.reject(new Error(`unexpected ${key}`));
    try {
      return Promise.resolve(handler(init));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function renderPage() {
  render(
    <ToastProvider>
      <MemoryRouter>
        <AdminClassesPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

function calls(key: string) {
  return request.mock.calls.filter(([path, init]) => `${init?.method ?? 'GET'} ${path}` === key);
}

describe('admin class list', () => {
  beforeEach(() => {
    request.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads every class in one call and links each class to its page', async () => {
    serve({ 'GET /admin/classes': () => [algo, web] });
    renderPage();

    const frame = await screen.findByRole('region', { name: 'Danh sách lớp' });
    expect(
      within(frame)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Lớp', 'Trợ giảng', 'Sinh viên', 'Mã mời']);
    expect(within(frame).getByRole('link', { name: 'Web nâng cao' })).toHaveAttribute(
      'href',
      `/admin/classes/${classId}`,
    );
    expect(within(frame).getByRole('link', { name: 'Algorithms' })).toHaveAttribute(
      'href',
      `/admin/classes/${otherId}`,
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(calls('GET /admin/classes')).toHaveLength(1);
    expect(within(frame).queryByRole('combobox')).toBeNull();
    expect(within(frame).queryByRole('button', { name: /Gán/ })).toBeNull();
  });

  it('names the tab "Lớp học"', async () => {
    serve({ 'GET /admin/classes': () => [web] });
    renderPage();
    await screen.findByRole('region', { name: 'Danh sách lớp' });
    expect(document.title).toBe('Lớp học · LeeTKOB');
  });

  it('names every TA with the email in small text below, or says there is none', async () => {
    serve({ 'GET /admin/classes': () => [algo, web] });
    renderPage();

    const webRow = await screen.findByRole('row', { name: /Web nâng cao/ });
    const [, taCell, studentCell, codeCell] = within(webRow).getAllByRole('cell');
    if (!taCell || !studentCell || !codeCell) throw new Error('expected four cells');
    const items = within(taCell).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Anna Trợ giảnganna.ta@truong.edu.vn',
      'Bình Trợ giảngbinh.ta@truong.edu.vn',
    ]);
    const email = within(taCell).getByText('anna.ta@truong.edu.vn');
    expect(email.tagName).toBe('SMALL');
    expect(email).toHaveClass('lk-people__email');
    expect(studentCell).toHaveTextContent(/^3$/);
    expect(within(codeCell).getByText(code)).toHaveClass('lk-mono');

    const algoRow = screen.getByRole('row', { name: /Algorithms/ });
    expect(within(algoRow).getAllByRole('cell')[1]).toHaveTextContent(/^Chưa có trợ giảng$/);
    expect(within(algoRow).getAllByRole('cell')[2]).toHaveTextContent(/^0$/);
  });

  it('copies the invite code and says "Đã sao chép" for 2 seconds', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    serve({ 'GET /admin/classes': () => [web] });
    renderPage();
    const button = await screen.findByRole('button', { name: 'Sao chép mã mời lớp Web nâng cao' });
    expect(button).toHaveTextContent(/^Sao chép$/);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(button);
    const row = screen.getByRole('row', { name: /Web nâng cao/ });
    expect(await within(row).findByText('Đã sao chép')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(code);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(within(row).queryByText('Đã sao chép')).toBeNull();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('lets the table frame take focus so it can scroll on a phone', async () => {
    serve({ 'GET /admin/classes': () => [web] });
    renderPage();
    const frame = await screen.findByRole('region', { name: 'Danh sách lớp' });
    expect(frame).toHaveClass('lk-table-wrap');
    expect(frame).toHaveAttribute('tabindex', '0');
    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    expect(css).toMatch(/\.lk-table-wrap:focus-visible \{[^}]*outline: 2px solid var\(--focus\);/);
    const bundle = readFileSync(join(process.cwd(), 'src/styles/ui.css'), 'utf8');
    expect(bundle).toMatch(/\.lk-table-wrap\{overflow-x:auto;/);
  });

  it('shows the empty state when there is no class', async () => {
    serve({ 'GET /admin/classes': () => [] });
    renderPage();
    expect(await screen.findByText('Chưa có lớp')).toBeInTheDocument();
  });

  it('shows a Vietnamese message when loading fails, never the English title or URN', async () => {
    serve({
      'GET /admin/classes': () => {
        throw new ApiProblemError({
          type: 'urn:leetkob:problem:class-access-denied',
          title: 'Class action is not allowed',
          status: 403,
        });
      },
    });
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bạn không có quyền thực hiện thao tác này');
    expect(alert).not.toHaveTextContent('Class action is not allowed');
    expect(alert).not.toHaveTextContent('urn:');
  });
});

describe('creating a class', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it.each(['', '   '])('refuses an empty name %j under the field before sending', async (name) => {
    serve({ 'GET /admin/classes': () => [] });
    renderPage();
    await screen.findByText('Chưa có lớp');
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));

    const input = await screen.findByLabelText('Tên lớp');
    expect(input).toHaveAccessibleDescription('Nhập tên lớp.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(calls('POST /classes')).toHaveLength(0);
  });

  it('refuses a name longer than 200 characters; accepts exactly 200', async () => {
    serve({
      'GET /admin/classes': () => [],
      'POST /classes': () => ({ id: classId, name: 'x'.repeat(200), inviteCode: code }),
    });
    renderPage();
    await screen.findByText('Chưa có lớp');
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: 'x'.repeat(201) } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));
    const input = await screen.findByLabelText('Tên lớp');
    expect(input).toHaveAccessibleDescription('Tên lớp tối đa 200 ký tự.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(calls('POST /classes')).toHaveLength(0);

    fireEvent.change(input, { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));
    expect(await screen.findByText(`Đã tạo lớp ${'x'.repeat(200)}.`)).toBeInTheDocument();
    expect(calls('POST /classes')).toHaveLength(1);
  });

  it('creates a class with the trimmed name, clears the field and lists the class', async () => {
    serve({
      'GET /admin/classes': () => [web],
      'POST /classes': () => ({ id: otherId, name: 'Algorithms', inviteCode: 'Zz'.repeat(16) }),
    });
    renderPage();
    await screen.findByRole('row', { name: /Web nâng cao/ });
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: '  Algorithms  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));

    expect(await screen.findByText('Đã tạo lớp Algorithms.')).toBeInTheDocument();
    expect(calls('POST /classes')[0]?.[1]?.body).toBe(JSON.stringify({ name: 'Algorithms' }));
    expect(screen.getByLabelText('Tên lớp')).toHaveValue('');
    const row = screen.getByRole('row', { name: /Algorithms/ });
    expect(within(row).getByRole('link', { name: 'Algorithms' })).toHaveAttribute(
      'href',
      `/admin/classes/${otherId}`,
    );
    expect(row).toHaveTextContent('Zz'.repeat(16));
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent(/^Chưa có trợ giảng$/);
  });

  it('confirms a new class in a toast, not in a status line inside the page (A3)', async () => {
    serve({
      'GET /admin/classes': () => [],
      'POST /classes': () => ({ id: classId, name: 'Lớp B', inviteCode: code }),
    });
    renderPage();
    await screen.findByText('Chưa có lớp');
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: 'Lớp B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));

    const toasts = screen.getByRole('status', { name: 'Thông báo' });
    expect(await within(toasts).findByText('Đã tạo lớp Lớp B.')).toBeInTheDocument();
    const page = screen.getByRole('region', { name: 'Lớp học' });
    expect(within(page).queryByText(/Đã tạo lớp/)).toBeNull();
    expect(page.querySelector('p[role="status"]')).toBeNull();
  });

  it('locks the button while the request is in flight', async () => {
    let finish: (value: unknown) => void = () => undefined;
    request.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Promise((resolve) => (finish = resolve));
      return Promise.resolve(path === '/admin/classes' ? [] : undefined);
    });
    renderPage();
    await screen.findByText('Chưa có lớp');
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: 'Lớp A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));

    const button = await screen.findByRole('button', { name: 'Tạo lớp' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Đang tạo lớp…');
    fireEvent.submit(button);
    expect(calls('POST /classes')).toHaveLength(1);

    await act(async () => {
      finish({ id: classId, name: 'Lớp A', inviteCode: code });
      await Promise.resolve();
    });
    expect(await screen.findByText('Đã tạo lớp Lớp A.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo lớp' })).toBeEnabled();
  });

  it('shows a server error in Vietnamese', async () => {
    serve({
      'GET /admin/classes': () => [],
      'POST /classes': () => {
        throw new ApiProblemError({
          type: 'urn:leetkob:problem:invalid-request',
          title: 'Invalid request',
          status: 400,
          detail: 'name must contain 1 to 200 characters.',
        });
      },
    });
    renderPage();
    await screen.findByText('Chưa có lớp');
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: 'Lớp A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dữ liệu chưa hợp lệ');
    expect(screen.queryByText(/name must contain|Invalid request/)).toBeNull();
  });
});
