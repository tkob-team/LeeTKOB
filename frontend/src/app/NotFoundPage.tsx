import { Link } from 'react-router';
import { useAuth } from './auth-context';
import { EmptyState } from './EmptyState';

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
    <main className="lk-page lk-page--narrow">
      <div className="lk-section">
        <EmptyState title="Không tìm thấy trang">Đường dẫn này không tồn tại.</EmptyState>
        <p>
          <Link className="lk-btn lk-btn--secondary" to={labListPath(session?.role)}>
            Về danh sách lab
          </Link>
        </p>
      </div>
    </main>
  );
}
