import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { SubmitJudgePage } from './SubmitJudgePage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const labId = '00000000-0000-0000-0000-000000000001';
const id = '00000000-0000-0000-0000-000000000002';

describe('submitting on a plain HTTP deployment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts with a UUID v4 Idempotency-Key when crypto.randomUUID does not exist', async () => {
    // Browsers expose crypto.randomUUID only in secure contexts (HTTPS or localhost).
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    request.mockReset();
    request.mockResolvedValueOnce([{ id: labId, title: 'Demo lab', latestSubmissionId: null }]);
    request.mockResolvedValueOnce({ id });
    request.mockResolvedValue({ status: 'queued', counted: true, tests: [] });

    render(<SubmitJudgePage />);
    await screen.findByRole('option', { name: 'Demo lab' });
    fireEvent.change(screen.getByLabelText('Mã nguồn C++17'), {
      target: { value: 'int main() {}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));

    expect(await screen.findByText(id)).toBeInTheDocument();
    const post = request.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(new Headers(post?.[1]?.headers).get('Idempotency-Key')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
