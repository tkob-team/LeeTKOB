import { createContext, useContext } from 'react';

export type Role = 'ta' | 'student';

export interface Session {
  token: string;
  role: Role;
  email: string;
  displayName: string;
}

export interface Credentials {
  email: string;
  password: string;
  role: Role;
}

export interface AuthState {
  session: Session | null;
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
  return role === 'ta' ? '/ta/classes' : '/student/submit';
}
