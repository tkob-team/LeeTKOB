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
}

export interface ApiClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export function createApiClient({
  baseUrl,
  getToken,
  fetch: fetchImpl = globalThis.fetch.bind(globalThis),
}: ApiClientOptions): ApiClient {
  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const headers = new Headers(init.headers);
      headers.set('Accept', 'application/json, application/problem+json');
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
      if (!response.ok) throw new ApiProblemError(await parseProblem(response));
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    },
  };
}

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  getToken: () => sessionStorage.getItem('leetkob.token'),
});
