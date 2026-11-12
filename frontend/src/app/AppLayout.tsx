import { NavLink, Outlet, useNavigate } from 'react-router';
import { Button } from '../components/ui';
import { useAuth } from './auth-context';

export interface NavItem {
  to: string;
  label: string;
}

export interface AppLayoutProps {
  /** `wide` for dense TA screens (max 1280px), `narrow` for one-column student screens (max 760px). */
  width: 'wide' | 'narrow';
  roleLabel: string;
  nav: NavItem[];
}

export function AppLayout({ width, roleLabel, nav }: AppLayoutProps) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="lk-shell">
      <header className="lk-shell__header">
        <div className={`lk-shell__bar lk-shell__bar--${width}`}>
          <span className="lk-shell__brand">LeeTKOB</span>
          <nav className="lk-shell__nav" aria-label="Điều hướng chính">
            {nav.map((item) => (
              <NavLink key={item.to} to={item.to} className="lk-shell__link">
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="lk-shell__user">
            <span className="lk-shell__who">
              {session?.displayName} · {roleLabel}
            </span>
            <Button
              onClick={() => {
                logout();
                void navigate('/login', { replace: true });
              }}
            >
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>
      <main className={`lk-page lk-page--${width}`}>
        <Outlet />
      </main>
    </div>
  );
}

export function TaLayout() {
  return (
    <AppLayout
      width="wide"
      roleLabel="Trợ giảng"
      nav={[
        { to: '/ta/classes', label: 'Lớp và chấm điểm' },
        { to: '/ta/review-queue', label: 'Hàng chờ duyệt' },
      ]}
    />
  );
}

export function StudentLayout() {
  return (
    <AppLayout
      width="narrow"
      roleLabel="Sinh viên"
      nav={[{ to: '/student/submit', label: 'Nộp bài' }]}
    />
  );
}
