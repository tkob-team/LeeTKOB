import { render, screen } from '@testing-library/react';
import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { AuthContext, type AuthState } from '../../app/auth-context';
import { CreateLabRoute } from './CreateLabRoute';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const classId = '1b2c3d4e-0000-4000-8000-000000000001';
const auth: AuthState = {
  session: { token: 't', role: 'ta', email: 'ta@leetkob.test', displayName: 'TA' },
  login: vi.fn(),
  logout: vi.fn(),
};

function renderRoute(onRender?: ProfilerOnRenderCallback) {
  const router = createMemoryRouter(
    [{ path: '/ta/classes/:classId/labs/new', element: <CreateLabRoute /> }],
    { initialEntries: [`/ta/classes/${classId}/labs/new`] },
  );
  const route = (
    <AuthContext value={auth}>
      <RouterProvider router={router} />
    </AuthContext>
  );
  render(
    onRender ? (
      <Profiler id="create-lab" onRender={onRender}>
        {route}
      </Profiler>
    ) : (
      route
    ),
  );
}

describe('create lab: the class is checked before the form (A5)', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('shows "Đang tải lớp…" and no form while the class loads', () => {
    request.mockReturnValue(new Promise(() => undefined));
    renderRoute();
    expect(screen.getByText('Đang tải lớp…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tiêu đề')).toBeNull();
    expect(request).toHaveBeenCalledWith(`/classes/${classId}`, expect.anything());
  });

  it.each([
    ['class-not-found', 404],
    ['invalid-request', 400],
  ])('shows "Không tìm thấy lớp" instead of the form on %s', async (type, status) => {
    request.mockRejectedValue(
      new ApiProblemError({ type: `urn:leetkob:problem:${type}`, title: 'English', status }),
    );
    renderRoute();
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy lớp' })).toBeInTheDocument();
    expect(screen.getByText('Lớp không tồn tại hoặc bạn không thuộc lớp này.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về Lớp của tôi' })).toHaveAttribute(
      'href',
      '/ta/classes',
    );
    expect(screen.queryByLabelText('Tiêu đề')).toBeNull();
    expect(document.title).toBe('Không tìm thấy lớp · LeeTKOB');
  });

  it('shows another failure as an alert, with a way back and no form', async () => {
    request.mockRejectedValue(
      new ApiProblemError({
        type: 'urn:leetkob:problem:internal-error',
        title: 'English',
        status: 500,
      }),
    );
    renderRoute();
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ đang gặp sự cố');
    expect(screen.getByRole('link', { name: '← Lớp của tôi' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Tiêu đề')).toBeNull();
  });

  it('sets the tab title in the same commit that shows the class-not-found screen', async () => {
    request.mockRejectedValue(
      new ApiProblemError({
        type: 'urn:leetkob:problem:class-not-found',
        title: 'English',
        status: 404,
      }),
    );
    const titles: string[] = [];
    renderRoute(() => {
      if (screen.queryByRole('heading', { name: 'Không tìm thấy lớp' })) {
        titles.push(document.title);
      }
    });

    await screen.findByRole('heading', { name: 'Không tìm thấy lớp' });
    expect(titles[0]).toBe('Không tìm thấy lớp · LeeTKOB');
  });

  it("names the class in the title, the back link and the tab once it is the TA's", async () => {
    request.mockResolvedValue({ id: classId, name: 'CTT1' });
    renderRoute();
    expect(
      await screen.findByRole('heading', { name: 'Tạo lab cho CTT1', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← CTT1' })).toHaveAttribute(
      'href',
      `/ta/classes/${classId}`,
    );
    expect(screen.getByLabelText('Tiêu đề')).toBeInTheDocument();
    expect(document.title).toBe('Tạo lab · CTT1 · LeeTKOB');
  });
});
