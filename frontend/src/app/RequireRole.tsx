import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { homePath, loginPath, useAuth, type Role } from './auth-context';

export interface RequireRoleProps {
  role: Role;
  children: ReactNode;
}

/**
 * Sends signed-out users to /login?next=<this page> and users of the other role to their own
 * home. After "Đăng xuất" there is no `next`: whoever signs in next starts at their role's home.
 */
export function RequireRole({ role, children }: RequireRoleProps) {
  const { session, signOutReason } = useAuth();
  const location = useLocation();
  if (!session) {
    if (signOutReason === 'logout') return <Navigate to="/login" replace />;
    return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  }
  if (session.role !== role) return <Navigate to={homePath(session.role)} replace />;
  return children;
}

export function HomeRedirect() {
  const { session } = useAuth();
  return <Navigate to={session ? homePath(session.role) : '/login'} replace />;
}
