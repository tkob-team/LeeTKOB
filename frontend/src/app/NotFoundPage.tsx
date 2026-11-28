import { Link } from 'react-router';
import { AdminLayout, StudentLayout, TaLayout } from './AppLayout';
import { useAuth, type Role } from './auth-context';
import { EmptyState } from './EmptyState';
import type { NotFoundPageProps } from './not-found-text';
import { PublicLayout } from './PublicLayout';
import { usePageTitle } from './usePageTitle';

/** The home list of the signed-in role and a button label that names where it really goes. */
function homeLink(role: Role | undefined): { to: string; label: string } {
  if (role === 'admin') return { to: '/admin/classes', label: 'Về danh sách lớp' };
  if (role === 'ta') return { to: '/ta/classes', label: 'Về Lớp của tôi' };
  if (role === 'student') return { to: '/student/labs', label: 'Về danh sách đề bài' };
  return { to: '/', label: 'Về trang đăng nhập' };
}

/** What is missing and one way back. */
export function NotFoundPage({
  title = 'Không tìm thấy trang',
  detail = 'Đường dẫn này không tồn tại.',
}: NotFoundPageProps) {
  const { session } = useAuth();
  const home = homeLink(session?.role);
  usePageTitle(title);
  return (
    <div className="lk-section">
      <EmptyState title={title}>{detail}</EmptyState>
      <p>
        <Link className="lk-btn lk-btn--secondary" to={home.to}>
          {home.label}
        </Link>
      </p>
    </div>
  );
}

/**
 * Route for any unknown path. Signed in, the 404 sits in the app layout (header, menu,
 * "Đăng xuất"), so the user is visibly still in the app; signed out, it uses the public frame.
 */
export function NotFoundRoute() {
  const { session } = useAuth();
  if (session?.role === 'admin') {
    return (
      <AdminLayout>
        <NotFoundPage />
      </AdminLayout>
    );
  }
  if (session?.role === 'ta') {
    return (
      <TaLayout>
        <NotFoundPage />
      </TaLayout>
    );
  }
  if (session?.role === 'student') {
    return (
      <StudentLayout>
        <NotFoundPage />
      </StudentLayout>
    );
  }
  return (
    <PublicLayout>
      <main className="lk-page lk-page--narrow">
        <NotFoundPage />
      </main>
    </PublicLayout>
  );
}
