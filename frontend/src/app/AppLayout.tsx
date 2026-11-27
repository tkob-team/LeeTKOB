import { Link, matchPath, Outlet, useLocation, useNavigate } from 'react-router';
import { Button } from '../components/ui';
import { homePath, useAuth } from './auth-context';
import { ThemeToggle } from './ThemeToggle';

export interface NavItem {
  to: string;
  label: string;
  /** Route patterns where this item is the current page; defaults to `to` and its sub-paths. */
  activeOn?: string[];
}

function isActive(item: NavItem, pathname: string): boolean {
  return (item.activeOn ?? [item.to]).some(
    (pattern) => matchPath({ path: pattern, end: false }, pathname) !== null,
  );
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
  const { pathname } = useLocation();
  return (
    <div className="lk-shell">
      <header className="lk-shell__header">
        <div className={`lk-shell__bar lk-shell__bar--${width}`}>
          <Link to={session ? homePath(session.role) : '/login'} className="lk-shell__brand">
            LeeTKOB
          </Link>
          <nav className="lk-shell__nav" aria-label="Điều hướng chính">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="lk-shell__link"
                aria-current={isActive(item, pathname) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="lk-shell__user">
            <span className="lk-shell__who">
              {session?.displayName} · {roleLabel}
            </span>
            <ThemeToggle />
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
        {
          to: '/ta/labs',
          label: 'Lab',
          // The lab list, creating a lab and each lab's review queue belong to one menu item.
          activeOn: ['/ta/labs', '/ta/classes/:classId/labs/new', '/ta/review-queue'],
        },
      ]}
    />
  );
}

export function StudentLayout() {
  return (
    <AppLayout
      width="narrow"
      roleLabel="Sinh viên"
      nav={[
        { to: '/student/labs', label: 'Đề bài' },
        { to: '/student/submit', label: 'Nộp bài' },
      ]}
    />
  );
}
