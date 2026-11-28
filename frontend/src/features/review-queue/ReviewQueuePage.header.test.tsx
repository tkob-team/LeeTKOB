import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { AuthContext, type AuthState } from '../../app/auth-context';
import { formatDateTime } from '../lab-authoring/lab-api';
import type { ReviewItem, ReviewQueuePage as QueueResponse } from './review-queue';
import { ReviewQueuePage } from './ReviewQueuePage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const labId = '8f2d1c34-5e6a-4f7b-9c10-1a2b3c4d5e6f';
const classId = '1b2c3d4e-0000-4000-8000-000000000001';
const lab = {
  id: labId,
  classId,
  title: 'Sorting with merge sort',
  statementMd: '# Sorting',
  opensAt: '2026-11-03T01:00:00.000Z',
  // Long past: the phase is "Hết hạn" whatever day the test runs.
  dueAt: '2026-11-10T16:59:00.000Z',
  cpuTimeMs: 1000,
  wallTimeMs: 3000,
  memoryMb: 256,
  constraints: [],
};

const auth: AuthState = {
  session: { token: 't', role: 'ta', email: 'ta@leetkob.test', displayName: 'TA' },
  login: vi.fn(),
  logout: vi.fn(),
};

const item: ReviewItem = {
  submissionId: 'aaaaaaaa-0000-4000-8000-000000000001',
  student: { id: 'c1d2e3f4-0a1b-4c2d-8e3f-9a0b1c2d3e4f', displayName: null },
  submittedAt: '2026-11-10T03:15:42.120Z',
  judgeStatus: 'completed',
  verdict: 'AC',
  reviewStatus: 'checked',
  needsReview: true,
  constraints: (['hard_rule', 'model', 'guardrail'] as const).map((source, i) => ({
    code: `C${String(i + 1)}`,
    text: `Constraint ${String(i + 1)}`,
    deduction: 1,
    verdict: 'violation' as const,
    source,
    evidence: [],
    reason: null,
    unsureCause: null,
    needsReview: true,
  })),
};

const queue: QueueResponse = {
  labId,
  provisional: false,
  page: 0,
  size: 20,
  totalItems: 1,
  totalPages: 1,
  items: [item],
};

function renderQueue() {
  render(
    <AuthContext value={auth}>
      <MemoryRouter initialEntries={[`/ta/labs/${labId}/review`]}>
        <Routes>
          <Route path="/ta/labs/:labId/review" element={<ReviewQueuePage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext>,
  );
}

/** Lab and class answer `lab`/`classroom`; the queue answers `queueAnswer`. */
function serve({
  labAnswer = () => Promise.resolve(lab),
  queueAnswer = () => Promise.resolve(queue),
}: {
  labAnswer?: () => Promise<unknown>;
  queueAnswer?: () => Promise<unknown>;
} = {}) {
  request.mockImplementation((path: string) => {
    if (path === `/labs/${labId}`) return labAnswer();
    if (path === `/classes/${classId}`) return Promise.resolve({ id: classId, name: 'CTT1' });
    return queueAnswer();
  });
}

describe('review queue header (A4)', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('names the lab, its deadline and phase, and links back to its class', async () => {
    serve();
    renderQueue();
    expect(
      await screen.findByRole('heading', { name: 'Hàng chờ duyệt: Sorting with merge sort' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '← CTT1' })).toHaveAttribute(
      'href',
      `/ta/classes/${classId}`,
    );
    expect(screen.getByText(`Hạn nộp ${formatDateTime(lab.dueAt)} · Hết hạn`)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(`/labs/${labId}`, expect.anything());
    expect(request).toHaveBeenCalledWith(`/classes/${classId}`, expect.anything());
    expect(screen.queryByRole('link', { name: /Về danh sách lab/ })).toBeNull();
  });

  it('titles the tab "Hàng chờ: <lab>" (A11)', async () => {
    serve();
    renderQueue();
    await screen.findByRole('heading', { name: 'Hàng chờ duyệt: Sorting with merge sort' });
    expect(document.title).toBe('Hàng chờ: Sorting with merge sort · LeeTKOB');
  });

  it('while the lab loads, shows the plain title and "← Lớp của tôi"', () => {
    serve({ labAnswer: () => new Promise(() => undefined) });
    renderQueue();
    expect(screen.getByRole('heading', { name: 'Hàng chờ duyệt' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Lớp của tôi' })).toHaveAttribute(
      'href',
      '/ta/classes',
    );
  });

  it('on 404 links back to Lớp của tôi twice (back link and button), never to /ta/labs', async () => {
    const notFound = new ApiProblemError({
      type: 'urn:leetkob:problem:lab-not-found',
      title: 'Lab not found',
      status: 404,
    });
    serve({
      labAnswer: () => Promise.reject(notFound),
      queueAnswer: () => Promise.reject(notFound),
    });
    renderQueue();
    await screen.findByRole('alert');
    expect(screen.getByRole('heading', { name: 'Hàng chờ duyệt' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Lớp của tôi' })).toHaveAttribute(
      'href',
      '/ta/classes',
    );
    expect(screen.getByRole('link', { name: 'Về Lớp của tôi' })).toHaveAttribute(
      'href',
      '/ta/classes',
    );
    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('href', '/ta/labs');
    }
  });
});

describe('review queue source column (A16)', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('names each source in Vietnamese with an explanation, never the API value', async () => {
    serve();
    renderQueue();
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Nguồn' })).toBeInTheDocument();
    const [hardRule, model, guardrail] = [
      within(table).getByText('Luật cứng'),
      within(table).getByText('Mô hình'),
      within(table).getByText('Chặn an toàn'),
    ];
    expect(hardRule.getAttribute('title')).toMatch(/không dùng mô hình/);
    expect(model.getAttribute('title')).toMatch(/mô hình ngôn ngữ/);
    expect(guardrail.getAttribute('title')).toMatch(/giới hạn/);
    expect(within(table).queryByText(/^(hard rule|hard_rule|model|guardrail)$/)).toBeNull();
  });
});
