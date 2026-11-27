import { Link } from 'react-router';
import { StudentLayout, TaLayout } from './AppLayout';
import { useAuth } from './auth-context';
import { EmptyState } from './EmptyState';
import { PublicLayout } from './PublicLayout';

/** Lab list of the signed-in role; signed-out users go through / to the login page. */
function labListPath(role: 'ta' | 'student' | undefined): string {
  if (role === 'ta') return '/ta/labs';
  if (role === 'student') return '/student/labs';
  return '/';
}

/** Page for an unknown path: what happened and one way back. */
export function NotFoundPage() {
  const { session } = useAuth();
  return (
    <div className="lk-section">
      <EmptyState title="Không tìm thấy trang">Đường dẫn này không tồn tại.</EmptyState>
      <p>
        <Link className="lk-btn lk-btn--secondary" to={labListPath(session?.role)}>
          Về danh sách lab
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
