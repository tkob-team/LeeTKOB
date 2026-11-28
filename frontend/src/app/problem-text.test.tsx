import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../api/client';
import { LoginPage } from '../features/auth/LoginPage';
import { CreateLabPage } from '../features/lab-authoring/CreateLabPage';
import { StudentLabPage, StudentLabsPage } from '../features/lab-view/StudentLabPage';
import { ReviewQueuePage } from '../features/review-queue/ReviewQueuePage';
import { SubmitJudgePage } from '../features/submit-judge/SubmitJudgePage';
import { TaClassesPage } from '../features/ta-classes/TaClassesPage';
import { TaClassPage } from '../features/ta-classes/TaClassPage';
import { AuthContext, type AuthState } from './auth-context';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../api/client')>();
  return { ...module, api: { request } };
});

const labId = '00000000-0000-4000-8000-000000000001';
const classId = '00000000-0000-4000-8000-0000000000c1';

function serverProblem(type: string, status: number): ApiProblemError {
  return new ApiProblemError({
    type: `urn:leetkob:problem:${type}`,
    title: 'Server title in English',
    status,
    detail: 'Server detail in English.',
    instance: '/x',
  });
}

const auth: AuthState = {
  session: { token: 't', role: 'ta', email: 'ta1@leetkob.test', displayName: 'TA' },
  login: vi.fn(),
  logout: vi.fn(),
};

function renderRoute(path: string, pattern: string, element: ReactElement) {
  const router = createMemoryRouter([{ path: pattern, element }], { initialEntries: [path] });
  render(
    <AuthContext value={auth}>
      <RouterProvider router={router} />
    </AuthContext>,
  );
}

async function expectVietnameseAlert(title: string) {
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(title);
  expect(alert).not.toHaveTextContent(/English|urn:/);
}

beforeEach(() => {
  request.mockReset();
});

describe('every page shows problems in Vietnamese', () => {
  it('TA class list: internal-error', async () => {
    request.mockRejectedValue(serverProblem('internal-error', 500));
    renderRoute('/ta/classes', '/ta/classes', <TaClassesPage />);
    await expectVietnameseAlert('Máy chủ đang gặp sự cố');
  });

  it('TA class page: internal-error', async () => {
    request.mockRejectedValue(serverProblem('internal-error', 500));
    renderRoute(`/ta/classes/${classId}`, '/ta/classes/:classId', <TaClassPage />);
    await expectVietnameseAlert('Máy chủ đang gặp sự cố');
  });

  it('create lab: invalid-request with Vietnamese field errors', async () => {
    renderRoute(
      `/ta/classes/${classId}/labs/new`,
      '/ta/classes/:classId/labs/new',
      <CreateLabPage />,
    );
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Lab' } });
    fireEvent.change(screen.getByLabelText('Mở lúc'), { target: { value: '2026-12-01T08:00' } });
    fireEvent.change(screen.getByLabelText('Hạn nộp'), { target: { value: '2026-12-08T08:00' } });
    request.mockRejectedValueOnce(
      new ApiProblemError({
        type: 'urn:leetkob:problem:invalid-request',
        title: 'Invalid request',
        status: 400,
        detail: 'The request is invalid.',
        errors: [{ field: 'statementMd', detail: 'must not be blank' }],
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lab' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Dữ liệu chưa hợp lệ');
    expect(alert).not.toHaveTextContent(/Invalid request|urn:/);
    expect(screen.getByLabelText('Đề bài (Markdown)')).toHaveAccessibleDescription(
      'Nhập đề bài, tối đa 65.536 ký tự.',
    );
  });

  it('create lab: class-not-found', async () => {
    renderRoute(
      `/ta/classes/${classId}/labs/new`,
      '/ta/classes/:classId/labs/new',
      <CreateLabPage />,
    );
    fireEvent.change(screen.getByLabelText('Mở lúc'), { target: { value: '2026-12-01T08:00' } });
    fireEvent.change(screen.getByLabelText('Hạn nộp'), { target: { value: '2026-12-08T08:00' } });
    request.mockRejectedValueOnce(serverProblem('class-not-found', 404));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lab' }));
    await expectVietnameseAlert('Không tìm thấy lớp');
  });

  it('review queue: forbidden-role', async () => {
    request.mockRejectedValue(serverProblem('forbidden-role', 403));
    renderRoute(`/ta/labs/${labId}/review`, '/ta/labs/:labId/review', <ReviewQueuePage />);
    await expectVietnameseAlert('Bạn không có quyền thực hiện thao tác này');
  });

  it('review queue: invalid-request (bad lab id in the URL)', async () => {
    request.mockRejectedValue(serverProblem('invalid-request', 400));
    renderRoute('/ta/labs/not-a-uuid/review', '/ta/labs/:labId/review', <ReviewQueuePage />);
    await expectVietnameseAlert('Dữ liệu chưa hợp lệ');
  });

  it('student statement: lab-not-found', async () => {
    request.mockRejectedValue(serverProblem('lab-not-found', 404));
    renderRoute(`/student/labs/${labId}`, '/student/labs/:labId', <StudentLabPage />);
    await expectVietnameseAlert('Không tìm thấy lab');
  });

  it('student statement: lab-not-open', async () => {
    request.mockRejectedValue(serverProblem('lab-not-open', 409));
    renderRoute(`/student/labs/${labId}`, '/student/labs/:labId', <StudentLabPage />);
    await expectVietnameseAlert('Lab chưa mở');
  });

  it('student lab list: an unknown type reads the generic message', async () => {
    request.mockRejectedValue(serverProblem('brand-new-problem', 418));
    renderRoute('/student/labs', '/student/labs', <StudentLabsPage />);
    await expectVietnameseAlert('Có lỗi xảy ra. Vui lòng thử lại.');
  });

  it('submit: lab-closed after posting', async () => {
    request.mockResolvedValueOnce([{ id: labId, title: 'Lab', latestSubmissionId: null }]);
    renderRoute('/student/submit', '/student/submit', <SubmitJudgePage />);
    await screen.findByRole('option', { name: 'Lab' });
    fireEvent.change(screen.getByLabelText('Mã nguồn C++17'), {
      target: { value: 'int main() {}' },
    });
    request.mockRejectedValueOnce(serverProblem('lab-closed', 409));
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    await expectVietnameseAlert('Lab đã hết hạn nộp');
  });

  it('submit: unauthenticated', async () => {
    request.mockRejectedValue(serverProblem('unauthenticated', 401));
    renderRoute('/student/submit', '/student/submit', <SubmitJudgePage />);
    await expectVietnameseAlert('Phiên đăng nhập đã hết hạn');
  });

  it('login: a field error from the server follows the field name', async () => {
    const login = vi.fn<AuthState['login']>(() =>
      Promise.reject(
        new ApiProblemError({
          type: 'urn:leetkob:problem:invalid-request',
          title: 'Invalid request',
          status: 400,
          errors: [{ field: 'password', detail: 'must be at most 72 bytes' }],
        }),
      ),
    );
    const router = createMemoryRouter([{ path: '/login', element: <LoginPage /> }], {
      initialEntries: ['/login'],
    });
    render(
      <AuthContext value={{ session: null, login, logout: vi.fn() }}>
        <RouterProvider router={router} />
      </AuthContext>,
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sv1@leetkob.test' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'x'.repeat(80) } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Nhập mật khẩu (tối đa 72 byte).')).toBeInTheDocument();
    expect(screen.queryByText(/must be at most/)).toBeNull();
  });

  it('login: an unknown type reads the generic message', async () => {
    const login = vi.fn<AuthState['login']>(() =>
      Promise.reject(serverProblem('brand-new-problem', 409)),
    );
    const router = createMemoryRouter([{ path: '/login', element: <LoginPage /> }], {
      initialEntries: ['/login'],
    });
    render(
      <AuthContext value={{ session: null, login, logout: vi.fn() }}>
        <RouterProvider router={router} />
      </AuthContext>,
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sv1@leetkob.test' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await expectVietnameseAlert('Có lỗi xảy ra. Vui lòng thử lại.');
  });
});
