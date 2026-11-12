import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { routes } from './routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

describe('app shell routes', () => {
  it('sends a signed-out user to the login page', async () => {
    const router = renderAt('/ta/review-queue');
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('shows field errors from the mocked problem response', async () => {
    renderAt('/login');
    fireEvent.click(await screen.findByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa đăng nhập được');
    expect(screen.getByLabelText('Mật khẩu')).toHaveAccessibleDescription('Nhập mật khẩu.');
  });

  it('signs a TA in, returns to the requested page, and keeps students out', async () => {
    const router = renderAt('/ta/review-queue');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'ta01@truong.edu.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Vai trò'), { target: { value: 'ta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('heading', { name: 'Hàng chờ duyệt' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/ta/review-queue');

    await router.navigate('/student/submit');
    expect(await screen.findByRole('heading', { name: 'Lớp và chấm điểm' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
  });
});
