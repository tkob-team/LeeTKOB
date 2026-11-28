import { createContext, useContext } from 'react';

export type Role = 'admin' | 'ta' | 'student';

export interface Session {
  token: string;
  role: Role;
  email: string;
  displayName: string;
}

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Why the session ended: `expired` after a 401 or when the token's exp passed (the login page
 * explains it and returns to `next`), `logout` after the user signed out (no `next`), null while
 * signed in or before any sign-in.
 */
export type SignOutReason = 'expired' | 'logout' | null;

export interface AuthState {
  session: Session | null;
  /** Optional so hand-built test states without it read as null. */
  signOutReason?: SignOutReason;
  login: (credentials: Credentials) => Promise<Session>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}

export function homePath(role: Role): string {
  if (role === 'admin') return '/admin/classes';
  return role === 'ta' ? '/ta/labs' : '/student/submit';
}

/** Query parameter of /login that names the page to return to after signing in. */
export const NEXT_PARAM = 'next';

/** `/login?next=<path>` for the page the user was on. */
export function loginPath(next: string): string {
  return `/login?${NEXT_PARAM}=${encodeURIComponent(next)}`;
}

/**
 * The `next` page if it is a path inside the app that belongs to `role`; otherwise the role's
 * home. Never an absolute or protocol-relative URL, so `next` cannot send the user off-site.
 */
export function afterLoginPath(role: Role, next: string | null): string {
  if (next?.startsWith(`/${role}/`) && !next.startsWith('//')) return next;
  return homePath(role);
}
