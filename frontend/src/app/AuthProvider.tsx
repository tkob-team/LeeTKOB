import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onUnauthorized } from '../api/client';
import { apiLogin, tokenExpiry } from './auth-api';
import { AuthContext, type AuthState, type Credentials, type Session } from './auth-context';

const SESSION_KEY = 'leetkob.session';
const TOKEN_KEY = 'leetkob.token';

/** Longest delay setTimeout accepts. */
const MAX_TIMER_MS = 2_147_483_647;

function isLive(session: Session): boolean {
  const expiry = tokenExpiry(session.token);
  return expiry !== null && expiry > Date.now();
}

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as Session) : null;
    if (session && isLive(session)) return session;
    writeSession(null);
    return null;
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

export function AuthProvider({ children, login: loginImpl = apiLogin }: AuthProviderProps) {
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

  // A 401 on a signed-in request means the token expired or was revoked: sign out, and
  // RequireRole sends the user to /login.
  useEffect(() => onUnauthorized(logout), [logout]);

  // Sign out when the token's exp passes, even without a request.
  useEffect(() => {
    if (!session) return;
    const expiry = tokenExpiry(session.token);
    const delay = expiry === null ? 0 : Math.min(expiry - Date.now(), MAX_TIMER_MS);
    const timer = setTimeout(logout, Math.max(delay, 0));
    return () => {
      clearTimeout(timer);
    };
  }, [session, logout]);

  const value = useMemo<AuthState>(() => ({ session, login, logout }), [session, login, logout]);
  return <AuthContext value={value}>{children}</AuthContext>;
}
