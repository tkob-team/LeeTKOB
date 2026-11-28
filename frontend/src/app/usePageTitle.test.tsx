import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from './auth-context';
import { NotFoundPage } from './NotFoundPage';
import { CLASS_NOT_FOUND } from './not-found-text';
import { PageTitle } from './PageTitle';
import { APP_NAME, pageTitle, usePageTitle } from './usePageTitle';

function Titled({ page }: { page: string | undefined }) {
  usePageTitle(page);
  return null;
}

function auth(role: 'admin' | 'ta' | 'student'): AuthState {
  return {
    session: { token: 't', role, email: 'x@leetkob.test', displayName: 'X' },
    login: vi.fn(),
    logout: vi.fn(),
  };
}

describe('usePageTitle (A11)', () => {
  it('writes "<page> · LeeTKOB"', () => {
    expect(pageTitle('Nộp bài')).toBe('Nộp bài · LeeTKOB');
  });

  it('sets the tab title, follows a change, and goes back to the app name on unmount', () => {
    const { rerender, unmount } = render(<Titled page="Đề bài" />);
    expect(document.title).toBe('Đề bài · LeeTKOB');
    rerender(<Titled page="Sorting" />);
    expect(document.title).toBe('Sorting · LeeTKOB');
    unmount();
    expect(document.title).toBe(APP_NAME);
  });

  it('leaves the title alone while the page passes undefined (an inner page names the tab)', () => {
    document.title = 'Không tìm thấy lớp · LeeTKOB';
    render(<Titled page={undefined} />);
    expect(document.title).toBe('Không tìm thấy lớp · LeeTKOB');
  });

  it('titles a page through <PageTitle> (admin routes)', () => {
    render(
      <PageTitle title="Lớp học">
        <p>admin</p>
      </PageTitle>,
    );
    expect(document.title).toBe('Lớp học · LeeTKOB');
  });

  it('titles the 404 page with its heading', () => {
    render(
      <AuthContext value={auth('ta')}>
        <MemoryRouter>
          <NotFoundPage {...CLASS_NOT_FOUND} />
        </MemoryRouter>
      </AuthContext>,
    );
    expect(document.title).toBe('Không tìm thấy lớp · LeeTKOB');
  });
});
