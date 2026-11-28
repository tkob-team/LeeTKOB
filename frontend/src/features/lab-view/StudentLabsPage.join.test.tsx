import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { ToastProvider } from '../../components/ui';
import { StudentLabsPage } from './StudentLabPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const code = 'AbCdEfGhIjKlMnOpQrStUvWxYz012-_9';
const lab = { id: 'l1', title: 'Sorting', latestSubmissionId: null };

function renderPage() {
  render(
    <ToastProvider>
      <MemoryRouter>
        <StudentLabsPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

function joinCalls() {
  return request.mock.calls.filter(([path]) => path === '/classes/join');
}

function labCalls() {
  return request.mock.calls.filter(([path]) => path === '/student/labs');
}

async function join(value: string) {
  fireEvent.change(await screen.findByLabelText('Mã mời'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Vào lớp' }));
}

function problem(type: string, status: number) {
  return new ApiProblemError({ type: `urn:leetkob:problem:${type}`, title: 'English', status });
}

describe('joining a class with an invite code', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('joins with the trimmed code, names the class and reloads the lab list', async () => {
    let joined = false;
    request.mockImplementation((path: string) => {
      if (path === '/classes/join') {
        joined = true;
        return Promise.resolve({ id: 'c1', name: 'Web nâng cao' });
      }
      return Promise.resolve(joined ? [lab] : []);
    });
    renderPage();
    expect(await screen.findByText('Lớp của bạn chưa có lab nào.')).toBeInTheDocument();

    await join(`  ${code}  `);
    expect(await screen.findByText('Đã vào lớp Web nâng cao.')).toBeInTheDocument();
    expect(joinCalls()[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ inviteCode: code }),
    });
    expect(await screen.findByRole('link', { name: 'Sorting' })).toBeInTheDocument();
    expect(labCalls()).toHaveLength(2);
    expect(screen.getByLabelText('Mã mời')).toHaveValue('');
  });

  it('accepts a code of a class the student already joined', async () => {
    request.mockImplementation((path: string) =>
      Promise.resolve(path === '/classes/join' ? { id: 'c1', name: 'CTT1' } : [lab]),
    );
    renderPage();
    await join(code);
    expect(await screen.findByText('Đã vào lớp CTT1.')).toBeInTheDocument();
    await join(code);
    await waitFor(() => {
      expect(screen.getAllByText('Đã vào lớp CTT1.')).toHaveLength(2);
    });
    expect(joinCalls()).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('confirms the join in a toast, not in a status line of the form (A3)', async () => {
    request.mockImplementation((path: string) =>
      Promise.resolve(path === '/classes/join' ? { id: 'c1', name: 'CTT1' } : []),
    );
    renderPage();
    await join(code);
    const toasts = screen.getByRole('status', { name: 'Thông báo' });
    expect(await within(toasts).findByText('Đã vào lớp CTT1.')).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Vào lớp bằng mã mời' });
    expect(form.querySelector('[role="status"]')).toBeNull();
  });

  it('asks for a code before sending anything when the field is empty', async () => {
    request.mockResolvedValue([]);
    renderPage();
    await join('   ');
    expect(await screen.findByLabelText('Mã mời')).toHaveAccessibleDescription('Nhập mã mời.');
    expect(joinCalls()).toHaveLength(0);
  });

  it('explains a malformed code (400) in Vietnamese', async () => {
    request.mockImplementation((path: string) =>
      path === '/classes/join'
        ? Promise.reject(problem('invalid-request', 400))
        : Promise.resolve([]),
    );
    renderPage();
    // A13 (audit 2026-11-28): a code of the wrong shape never reaches the server now, so the
    // server's 400 is reached with a 32-character code only.
    await join('A'.repeat(32));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Mã mời không hợp lệ');
    expect(alert).toHaveTextContent('Mã mời gồm đúng 32 ký tự');
    expect(alert).not.toHaveTextContent('English');
    expect(labCalls()).toHaveLength(1);
  });

  it('explains an unknown code (404) in Vietnamese and keeps what was typed', async () => {
    request.mockImplementation((path: string) =>
      path === '/classes/join'
        ? Promise.reject(problem('class-not-found', 404))
        : Promise.resolve([]),
    );
    renderPage();
    await join('x'.repeat(32));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không tìm thấy lớp');
    expect(alert).toHaveTextContent('Không có lớp nào dùng mã mời này');
    expect(screen.getByLabelText('Mã mời')).toHaveValue('x'.repeat(32));
    expect(screen.queryByText(/Đã vào lớp/)).toBeNull();
  });
});
