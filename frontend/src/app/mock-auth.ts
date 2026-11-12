import { ApiProblemError } from '../api/client';
import type { ProblemFieldError } from '../api/problem';
import type { Credentials, Session } from './auth-context';

/**
 * Mocked sign-in until the backend issues JWTs to the browser. Accepts any well-formed
 * email with a non-empty password and returns a fake, non-secret token.
 */
export function mockLogin({ email, password, role }: Credentials): Promise<Session> {
  const errors: ProblemFieldError[] = [];
  if (!/^[^\s@]+@[^\s@]+$/.test(email.trim())) {
    errors.push({ field: 'email', detail: 'Nhập email có dạng ten@truong.edu.vn.' });
  }
  if (password.length === 0) {
    errors.push({ field: 'password', detail: 'Nhập mật khẩu.' });
  }
  if (errors.length > 0) {
    return Promise.reject(
      new ApiProblemError({
        type: 'urn:leetkob:problem:invalid-request',
        title: 'Chưa đăng nhập được',
        status: 400,
        detail: 'Kiểm tra lại các ô bên dưới.',
        errors,
      }),
    );
  }
  const name = email.trim().split('@')[0] ?? email;
  return Promise.resolve({
    token: `mock-${role}-token`,
    role,
    email: email.trim(),
    displayName: name,
  });
}
