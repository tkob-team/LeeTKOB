import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState, type Role } from './auth-context';
import { NotFoundPage } from './NotFoundPage';

function renderAs(role: Role | undefined, props: Parameters<typeof NotFoundPage>[0] = {}) {
  const auth: AuthState = {
    session: role ? { token: 't', role, email: 'x@leetkob.test', displayName: 'X' } : null,
    login: vi.fn(),
    logout: vi.fn(),
  };
  render(
    <AuthContext value={auth}>
      <MemoryRouter>
        <NotFoundPage {...props} />
      </MemoryRouter>
    </AuthContext>,
  );
}

describe('NotFoundPage (A6)', () => {
  it.each([
    ['admin' as const, 'Về danh sách lớp', '/admin/classes'],
    ['ta' as const, 'Về Lớp của tôi', '/ta/classes'],
    ['student' as const, 'Về danh sách đề bài', '/student/labs'],
    [undefined, 'Về trang đăng nhập', '/'],
  ])('labels the way back for %s with where it goes', (role, label, href) => {
    renderAs(role);
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
    expect(screen.queryByRole('link', { name: 'Về danh sách lab' })).toBeNull();
  });

  it('takes the title and the sentence from the page that knows what is missing', () => {
    renderAs('admin', { title: 'Không tìm thấy lớp', detail: 'Lớp không tồn tại.' });
    expect(screen.getByRole('heading', { name: 'Không tìm thấy lớp' })).toBeInTheDocument();
    expect(screen.getByText('Lớp không tồn tại.')).toBeInTheDocument();
    expect(screen.queryByText('Không tìm thấy trang')).toBeNull();
  });

  it('keeps the generic wording for an unknown path', () => {
    renderAs('ta');
    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
    expect(screen.getByText('Đường dẫn này không tồn tại.')).toBeInTheDocument();
  });
});
