import { describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../api/client';
import { apiLogin, tokenExpiry } from './auth-api';

function client(answer: () => Promise<unknown>) {
  const request = vi.fn(answer);
  return { client: { request } as unknown as ApiClient, request };
}

function problem(type: string, status: number) {
  return () => Promise.reject(new ApiProblemError({ type, title: 'x', status }));
}

describe('apiLogin', () => {
  it('posts trimmed credentials and maps the session', async () => {
    const { client: c, request } = client(() =>
      Promise.resolve({ token: 'a.b.c', role: 'TA', displayName: 'Thay Ta' }),
    );
    const session = await apiLogin({ email: ' ta01@truong.edu.vn ', password: ' pw ' }, c);
    expect(request).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'ta01@truong.edu.vn', password: ' pw ' }),
    });
    expect(session).toEqual({
      token: 'a.b.c',
      role: 'ta',
      email: 'ta01@truong.edu.vn',
      displayName: 'Thay Ta',
    });
  });

  it('falls back to the email name when displayName is null', async () => {
    const { client: c } = client(() =>
      Promise.resolve({ token: 't', role: 'STUDENT', displayName: null }),
    );
    expect(await apiLogin({ email: 'sv01@truong.edu.vn', password: 'x' }, c)).toMatchObject({
      role: 'student',
      displayName: 'sv01',
    });
  });

  it('reports field errors without sending a request', async () => {
    const { client: c, request } = client(() => Promise.resolve({}));
    const error = await apiLogin({ email: 'nope', password: '' }, c).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiProblemError);
    expect((error as ApiProblemError).problem.errors?.map((e) => e.field)).toEqual([
      'email',
      'password',
    ]);
    expect(request).not.toHaveBeenCalled();
  });

  it('shows Vietnamese messages for wrong credentials and the attempt limit', async () => {
    const wrong = client(problem('urn:leetkob:problem:invalid-credentials', 401));
    await expect(apiLogin({ email: 'a@b', password: 'x' }, wrong.client)).rejects.toMatchObject({
      problem: { title: 'Sai email hoặc mật khẩu', status: 401 },
    });
    const limited = client(problem('urn:leetkob:problem:too-many-attempts', 429));
    await expect(apiLogin({ email: 'a@b', password: 'x' }, limited.client)).rejects.toMatchObject({
      problem: { title: 'Thử sai quá nhiều lần', status: 429 },
    });
  });

  it('signs an admin account in with the admin role (admin screens, feat/admin-ui)', async () => {
    const { client: c } = client(() =>
      Promise.resolve({ token: 't', role: 'ADMIN', displayName: null }),
    );
    await expect(apiLogin({ email: 'admin@b', password: 'x' }, c)).resolves.toMatchObject({
      role: 'admin',
      displayName: 'admin',
    });
  });

  it('refuses a role that has no web screens', async () => {
    const { client: c } = client(() =>
      Promise.resolve({ token: 't', role: 'AUDITOR', displayName: null }),
    );
    await expect(apiLogin({ email: 'x@b', password: 'x' }, c)).rejects.toMatchObject({
      problem: { title: 'Chưa có giao diện cho vai trò này' },
    });
  });
});

describe('tokenExpiry', () => {
  it('reads exp in milliseconds from a base64url payload', () => {
    const payload = btoa(JSON.stringify({ sub: 'u', exp: 1_800_000_000, x: '>>?' }))
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(tokenExpiry(`h.${payload}.s`)).toBe(1_800_000_000_000);
  });

  it('returns null for a token without a readable exp', () => {
    expect(tokenExpiry('not-a-jwt')).toBeNull();
    expect(tokenExpiry('h.%%%.s')).toBeNull();
    expect(tokenExpiry(`h.${btoa('{"sub":"u"}')}.s`)).toBeNull();
  });
});
