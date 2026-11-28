import type { ProblemDetails, ProblemFieldError } from './problem';

/** Thrown for every failed request; `problem` is safe to show with ProblemAlert. */
export class ApiProblemError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiProblemError';
    this.problem = problem;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFieldError(value: unknown): value is ProblemFieldError {
  return isRecord(value) && typeof value.field === 'string' && typeof value.detail === 'string';
}

/** Narrows a parsed body to RFC 9457 problem details with the fields docs/contract/ requires. */
export function toProblemDetails(body: unknown, status: number): ProblemDetails | null {
  if (!isRecord(body) || typeof body.type !== 'string' || typeof body.title !== 'string') {
    return null;
  }
  const problem: ProblemDetails = {
    type: body.type,
    title: body.title,
    status: typeof body.status === 'number' ? body.status : status,
  };
  if (typeof body.detail === 'string') problem.detail = body.detail;
  if (typeof body.instance === 'string') problem.instance = body.instance;
  if (Array.isArray(body.errors)) problem.errors = body.errors.filter(isFieldError);
  return problem;
}

/** Reads a failed response as problem details; non-problem bodies get a generic problem. */
export async function parseProblem(response: Response): Promise<ProblemDetails> {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('json')) {
    try {
      const problem = toProblemDetails(await response.json(), response.status);
      if (problem) return problem;
    } catch {
      // Fall through to the generic problem below; never surface raw bodies.
    }
  }
  return {
    type: 'about:blank',
    title: response.statusText || 'Yêu cầu thất bại',
    status: response.status,
  };
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Bearer token for the Authorization header, or null when signed out. */
  getToken?: () => string | null;
  fetch?: typeof fetch;
  /**
   * Called for every 401 except the answer to POST /auth/login (wrong email or password is
   * shown by the login form). A 401 means there is no usable session, whether the request
   * carried an expired or revoked token or none at all.
   */
  onUnauthorized?: () => void;
}

export interface ApiClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  openEventStream(path: string, signal: AbortSignal): Promise<Response>;
}

/** POST /auth/login: its 401 is a wrong password, not an ended session. */
function isLoginRequest(path: string, method: string | undefined): boolean {
  return (method ?? 'GET').toUpperCase() === 'POST' && path.split('?')[0] === '/auth/login';
}

export function createApiClient({
  baseUrl,
  getToken,
  // Looked up on each call, so a fetch replaced after start-up (tests, polyfills) is used.
  fetch: fetchImpl = (input, init) => globalThis.fetch(input, init),
  onUnauthorized,
}: ApiClientOptions): ApiClient {
  async function send(path: string, init: RequestInit, accept: string): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Accept', accept);
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const token = getToken?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new ApiProblemError({
        type: 'about:blank',
        title: 'Không kết nối được máy chủ',
        status: 0,
        detail: 'Kiểm tra kết nối mạng rồi thử lại.',
      });
    }
    if (response.status === 401 && !isLoginRequest(path, init.method)) onUnauthorized?.();
    if (!response.ok) throw new ApiProblemError(await parseProblem(response));
    return response;
  }

  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const response = await send(path, init, 'application/json, application/problem+json');
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    },
    openEventStream(path, signal) {
      return send(path, { signal }, 'text/event-stream, application/problem+json');
    },
  };
}

/**
 * localStorage key of the session (app/AuthProvider.tsx). The bearer token is stored only
 * inside it, so the token and the session cannot disagree.
 */
export const SESSION_KEY = 'leetkob.session';

/** Key where older builds kept a second copy of the token; read once on start, then removed. */
export const LEGACY_TOKEN_KEY = 'leetkob.token';

/** The token of the stored session, or null when there is none (or it cannot be read). */
export function storedToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    const session = JSON.parse(raw) as { token?: unknown } | null;
    return typeof session?.token === 'string' && session.token !== '' ? session.token : null;
  } catch {
    return null;
  }
}

const unauthorizedListeners = new Set<() => void>();

/** Subscribes to 401 answers of `api` (except login); returns the unsubscribe function. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  getToken: storedToken,
  onUnauthorized: () => {
    unauthorizedListeners.forEach((listener) => {
      listener();
    });
  },
});
