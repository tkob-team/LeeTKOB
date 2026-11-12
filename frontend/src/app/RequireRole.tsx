import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { homePath, useAuth, type Role } from './auth-context';

export interface RequireRoleProps {
  role: Role;
  children: ReactNode;
}

/** Sends signed-out users to /login and users of the other role to their own home. */
export function RequireRole({ role, children }: RequireRoleProps) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.role !== role) return <Navigate to={homePath(session.role)} replace />;
  return children;
}

export function HomeRedirect() {
  const { session } = useAuth();
  return <Navigate to={session ? homePath(session.role) : '/login'} replace />;
}
