import { describe, expect, it, vi } from 'vitest';
import { ApiProblemError, createApiClient, parseProblem } from './client';

function problemResponse(body: unknown, status: number, contentType = 'application/problem+json') {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
}

describe('parseProblem', () => {
  it('parses an RFC 9457 body with field errors', async () => {
    const problem = await parseProblem(
      problemResponse(
        {
          type: 'urn:leetkob:problem:invalid-request',
          title: 'Invalid request',
          status: 400,
          detail: 'code must not be blank',
          instance: '/labs/1/submissions',
          errors: [{ field: 'code', detail: 'must not be blank' }, { bogus: true }],
        },
        400,
      ),
    );
    expect(problem).toEqual({
      type: 'urn:leetkob:problem:invalid-request',
      title: 'Invalid request',
      status: 400,
      detail: 'code must not be blank',
      instance: '/labs/1/submissions',
      errors: [{ field: 'code', detail: 'must not be blank' }],
    });
  });

  it('falls back to a generic problem for a non-problem body', async () => {
    const response = new Response('<html>Bad gateway</html>', {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/html' },
    });
    expect(await parseProblem(response)).toEqual({
      type: 'about:blank',
      title: 'Bad Gateway',
      status: 502,
    });
  });
});

describe('createApiClient', () => {
  it('sends the bearer token and returns JSON on success', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('{"id":1}', { status: 200 })),
    );
    const client = createApiClient({
      baseUrl: 'http://api.test',
      getToken: () => 'tok',
      fetch: fetchMock,
    });
    await expect(client.request('/classes')).resolves.toEqual({ id: 1 });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://api.test/classes');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('throws ApiProblemError carrying the parsed problem', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        problemResponse(
          { type: 'urn:leetkob:problem:lab-closed', title: 'Lab is closed', status: 409 },
          409,
        ),
      ),
    );
    const client = createApiClient({ baseUrl: '', fetch: fetchMock });
    const error = await client.request('/labs/1/submissions', { method: 'POST', body: '{}' }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiProblemError);
    expect((error as ApiProblemError).problem.type).toBe('urn:leetkob:problem:lab-closed');
  });

  it('turns a network failure into a problem', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')));
    const client = createApiClient({ baseUrl: '', fetch: fetchMock });
    await expect(client.request('/x')).rejects.toMatchObject({ problem: { status: 0 } });
  });
});
