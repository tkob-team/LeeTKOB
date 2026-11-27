import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onUnauthorized, TOKEN_KEY } from '../api/client';
import { apiLogin, tokenExpiry } from './auth-api';
import {
  AuthContext,
  type AuthState,
  type Credentials,
  type Session,
  type SignOutReason,
} from './auth-context';

/**
 * The session lives in localStorage so a new tab of the same browser is signed in too. Signing
 * out in one tab clears it, and the `storage` event signs the other tabs out. Sessions saved by
 * older builds in sessionStorage are moved over once.
 */
const SESSION_KEY = 'leetkob.session';

/** Longest delay setTimeout accepts. */
const MAX_TIMER_MS = 2_147_483_647;

function isLive(session: Session): boolean {
  const expiry = tokenExpiry(session.token);
  return expiry !== null && expiry > Date.now();
}

/** Moves a session saved in sessionStorage by an older build to localStorage, once. */
function migrateLegacySession(): void {
  const legacy = sessionStorage.getItem(SESSION_KEY);
  if (legacy === null) return;
  if (localStorage.getItem(SESSION_KEY) === null) {
    localStorage.setItem(SESSION_KEY, legacy);
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token !== null) localStorage.setItem(TOKEN_KEY, token);
  }
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

function readSession(): Session | null {
  try {
    migrateLegacySession();
    const raw = localStorage.getItem(SESSION_KEY);
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
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      localStorage.setItem(TOKEN_KEY, session.token);
    } else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
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
  const [signOutReason, setSignOutReason] = useState<SignOutReason>(null);

  const login = useCallback(
    async (credentials: Credentials) => {
      const next = await loginImpl(credentials);
      writeSession(next);
      setSession(next);
      setSignOutReason(null);
      return next;
    },
    [loginImpl],
  );

  const endSession = useCallback((reason: Exclude<SignOutReason, null>) => {
    writeSession(null);
    setSession(null);
    setSignOutReason(reason);
  }, []);

  const logout = useCallback(() => {
    endSession('logout');
  }, [endSession]);

  const expire = useCallback(() => {
    endSession('expired');
  }, [endSession]);

  // A 401 on a signed-in request means the token expired or was revoked: sign out, and
  // RequireRole sends the user to /login?next=<this page> with the "session expired" note.
  useEffect(() => onUnauthorized(expire), [expire]);

  // Another tab signed in or out (or cleared storage): follow it. A missing or expired session
  // signs this tab out, and RequireRole sends the user to /login.
  useEffect(() => {
    const follow = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SESSION_KEY) return;
      const next = readSession();
      setSession(next);
      setSignOutReason(next ? null : 'logout');
    };
    window.addEventListener('storage', follow);
    return () => {
      window.removeEventListener('storage', follow);
    };
  }, []);

  // Sign out when the token's exp passes, even without a request.
  useEffect(() => {
    if (!session) return;
    const expiry = tokenExpiry(session.token);
    const delay = expiry === null ? 0 : Math.min(expiry - Date.now(), MAX_TIMER_MS);
    const timer = setTimeout(expire, Math.max(delay, 0));
    return () => {
      clearTimeout(timer);
    };
  }, [session, expire]);

  const value = useMemo<AuthState>(
    () => ({ session, signOutReason, login, logout }),
    [session, signOutReason, login, logout],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
