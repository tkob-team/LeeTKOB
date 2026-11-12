import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthState, type Credentials, type Session } from './auth-context';
import { mockLogin } from './mock-auth';

const SESSION_KEY = 'leetkob.session';
const TOKEN_KEY = 'leetkob.token';

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null): void {
  try {
    if (session) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      sessionStorage.setItem(TOKEN_KEY, session.token);
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the session then lasts for this page only.
  }
}

export interface AuthProviderProps {
  children: ReactNode;
  login?: (credentials: Credentials) => Promise<Session>;
}

export function AuthProvider({ children, login: loginImpl = mockLogin }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(readSession);

  const login = useCallback(
    async (credentials: Credentials) => {
      const next = await loginImpl(credentials);
      writeSession(next);
      setSession(next);
      return next;
    },
    [loginImpl],
  );

  const logout = useCallback(() => {
    writeSession(null);
    setSession(null);
  }, []);

  const value = useMemo<AuthState>(() => ({ session, login, logout }), [session, login, logout]);
  return <AuthContext value={value}>{children}</AuthContext>;
}
