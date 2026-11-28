import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { AdminClassesPage } from './AdminClassesPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const classId = '1b2c3d4e-0000-4000-8000-000000000001';
const code = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';
const anna = { id: '2c3d4e5f-0000-4000-8000-000000000002', email: 'anna.ta@truong.edu.vn' };
const zed = { id: '3d4e5f60-0000-4000-8000-000000000003', email: 'zed.ta@truong.edu.vn' };

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
    <MemoryRouter>
      <AdminClassesPage />
    </MemoryRouter>,
  );
}

function calls(key: string) {
  return request.mock.calls.filter(([path, init]) => `${init?.method ?? 'GET'} ${path}` === key);
}

describe('admin class list', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('shows each class with its invite code, a copy button and TA/student counts', async () => {
    serve({
      'GET /classes': () => [{ id: classId, name: 'CTT1', inviteCode: code }],
      'GET /admin/tas': () => [anna, zed],
      [`GET /classes/${classId}/members`]: () => [
        { id: anna.id, role: 'TA' },
        { id: 's1', role: 'STUDENT' },
        { id: 's2', role: 'STUDENT' },
        { id: 's3', role: 'STUDENT' },
      ],
    });
    renderPage();

    const table = await screen.findByRole('table', { name: 'Danh sách lớp' });
    const row = within(table).getByRole('row', { name: /CTT1/ });
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('CTT1');
    expect(cells[1]).toHaveTextContent(code);
    expect(within(row).getByRole('button', { name: 'Sao chép mã mời' })).toBeInTheDocument();
    expect(cells[2]).toHaveTextContent('1');
    expect(cells[3]).toHaveTextContent('3');
    const select = within(row).getByRole('combobox', { name: 'Trợ giảng cho lớp CTT1' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Chọn trợ giảng…', 'anna.ta@truong.edu.vn', 'zed.ta@truong.edu.vn']);
  });

  it('shows the empty state when there is no class', async () => {
    serve({ 'GET /classes': () => [], 'GET /admin/tas': () => [] });
    renderPage();
    expect(await screen.findByText('Chưa có lớp')).toBeInTheDocument();
  });

  it('shows a Vietnamese message when loading fails', async () => {
    serve({
      'GET /classes': () => {
        throw new ApiProblemError({
          type: 'urn:leetkob:problem:class-access-denied',
          title: 'Class action is not allowed',
          status: 403,
        });
      },
      'GET /admin/tas': () => [],
    });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bạn không có quyền thực hiện thao tác này',
    );
    expect(screen.queryByText('Class action is not allowed')).toBeNull();
  });
});

describe('creating a class', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it.each(['', '   '])('refuses an empty name %j before sending anything', async (name) => {
    serve({ 'GET /classes': () => [], 'GET /admin/tas': () => [] });
    renderPage();
    await screen.findByText('Chưa có lớp');
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));

    expect(await screen.findByLabelText('Tên lớp')).toHaveAccessibleDescription('Nhập tên lớp.');
    expect(calls('POST /classes')).toHaveLength(0);
  });

  it('refuses a name longer than 200 characters before sending anything', async () => {
    serve({ 'GET /classes': () => [], 'GET /admin/tas': () => [] });
    renderPage();
    await screen.findByText('Chưa có lớp');
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: 'x'.repeat(201) } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));
    expect(await screen.findByLabelText('Tên lớp')).toHaveAccessibleDescription(
      'Tên lớp tối đa 200 ký tự.',
    );
    expect(calls('POST /classes')).toHaveLength(0);
  });

  it('creates a class with the trimmed name and lists it with its invite code', async () => {
    serve({
      'GET /classes': () => [],
      'GET /admin/tas': () => [anna],
      'POST /classes': () => ({ id: classId, name: 'Web nâng cao', inviteCode: code }),
    });
    renderPage();
    await screen.findByText('Chưa có lớp');
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: '  Web nâng cao  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));

    expect(await screen.findByText('Đã tạo lớp Web nâng cao.')).toBeInTheDocument();
    expect(calls('POST /classes')[0]?.[1]?.body).toBe(JSON.stringify({ name: 'Web nâng cao' }));
    const row = screen.getByRole('row', { name: /Web nâng cao/ });
    expect(row).toHaveTextContent(code);
    expect(screen.getByLabelText('Tên lớp')).toHaveValue('');
  });

  it('shows the server field error in Vietnamese', async () => {
    serve({
      'GET /classes': () => [],
      'GET /admin/tas': () => [],
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
    expect(screen.queryByText(/name must contain/)).toBeNull();
  });
});

describe('assigning a TA', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('assigns the chosen TA, says "Đã gán", refreshes the counts, and accepts a repeat', async () => {
    let assigned = false;
    serve({
      'GET /classes': () => [{ id: classId, name: 'CTT1', inviteCode: code }],
      'GET /admin/tas': () => [anna, zed],
      [`GET /classes/${classId}`]: () => ({ id: classId, name: 'CTT1', inviteCode: code }),
      [`GET /classes/${classId}/members`]: () => (assigned ? [{ id: zed.id, role: 'TA' }] : []),
      [`POST /classes/${classId}/tas`]: () => {
        assigned = true;
        return undefined;
      },
    });
    renderPage();
    const row = await screen.findByRole('row', { name: /CTT1/ });
    const gan = () => within(row).getByRole('button', { name: 'Gán trợ giảng cho lớp CTT1' });
    expect(gan()).toBeDisabled();
    expect(within(row).getByText('Chọn một trợ giảng trước.')).toBeInTheDocument();

    fireEvent.change(within(row).getByRole('combobox'), { target: { value: zed.id } });
    fireEvent.click(gan());
    expect(await within(row).findByText('Đã gán zed.ta@truong.edu.vn.')).toBeInTheDocument();
    expect(calls(`POST /classes/${classId}/tas`)[0]?.[1]?.body).toBe(
      JSON.stringify({ userId: zed.id }),
    );
    expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('1');

    fireEvent.click(gan());
    expect(await within(row).findByText('Đã gán zed.ta@truong.edu.vn.')).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(calls(`POST /classes/${classId}/tas`)).toHaveLength(2);
    });
    expect(within(row).queryByRole('alert')).toBeNull();
  });

  it('says there is no TA account to assign when /admin/tas is empty', async () => {
    serve({
      'GET /classes': () => [{ id: classId, name: 'CTT1', inviteCode: code }],
      'GET /admin/tas': () => [],
      [`GET /classes/${classId}/members`]: () => [],
    });
    renderPage();
    const row = await screen.findByRole('row', { name: /CTT1/ });
    expect(within(row).getByText('Chưa có tài khoản trợ giảng.')).toBeInTheDocument();
    expect(within(row).queryByRole('combobox')).toBeNull();
  });
});
