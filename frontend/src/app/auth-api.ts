import { ApiProblemError, api, type ApiClient } from '../api/client';
import type { ProblemFieldError } from '../api/problem';
import type { Credentials, Role, Session } from './auth-context';

/** 200 body of POST /auth/login (docs/contract/post-auth-login.md). */
interface LoginResponse {
  token: string;
  role: 'ADMIN' | 'TA' | 'STUDENT';
  displayName: string | null;
}

const ROLES: Partial<Record<LoginResponse['role'], Role>> = { TA: 'ta', STUDENT: 'student' };

function invalid(errors: ProblemFieldError[]): ApiProblemError {
  return new ApiProblemError({
    type: 'urn:leetkob:problem:invalid-request',
    title: 'Chưa đăng nhập được',
    status: 400,
    detail: 'Kiểm tra lại các ô bên dưới.',
    errors,
  });
}

/** Signs in with POST /auth/login. Obvious input mistakes are reported before any request. */
export async function apiLogin(
  { email, password }: Credentials,
  client: ApiClient = api,
): Promise<Session> {
  const trimmed = email.trim();
  const errors: ProblemFieldError[] = [];
  if (!/^[^\s@]+@[^\s@]+$/.test(trimmed)) {
    errors.push({ field: 'email', detail: 'Nhập email có dạng ten@truong.edu.vn.' });
  }
  if (password.length === 0) {
    errors.push({ field: 'password', detail: 'Nhập mật khẩu.' });
  }
  if (errors.length > 0) throw invalid(errors);

  let response: LoginResponse;
  try {
    response = await client.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: trimmed, password }),
    });
  } catch (error) {
    if (!(error instanceof ApiProblemError)) throw error;
    const { type, status } = error.problem;
    if (type === 'urn:leetkob:problem:invalid-credentials') {
      throw new ApiProblemError({
        type,
        title: 'Sai email hoặc mật khẩu',
        status,
        detail: 'Kiểm tra lại email và mật khẩu rồi thử lại.',
      });
    }
    if (type === 'urn:leetkob:problem:too-many-attempts') {
      throw new ApiProblemError({
        type,
        title: 'Thử sai quá nhiều lần',
        status,
        detail: 'Tạm khoá đăng nhập. Đợi khoảng 15 phút rồi thử lại.',
      });
    }
    throw error;
  }

  const role = ROLES[response.role];
  if (!role) {
    throw new ApiProblemError({
      type: 'about:blank',
      title: 'Chưa có giao diện cho vai trò này',
      status: 403,
      detail: 'Tài khoản quản trị chưa dùng được trên giao diện web.',
    });
  }
  return {
    token: response.token,
    role,
    email: trimmed,
    displayName: response.displayName ?? trimmed.split('@')[0] ?? trimmed,
  };
}

/** Reads `exp` (milliseconds since the epoch) from a JWT payload, or null when absent. */
export function tokenExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as {
      exp?: unknown;
    };
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}
