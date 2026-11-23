import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { AuthContext, type AuthState } from '../../app/auth-context';
import type { ReviewItem, ReviewQueuePage as QueueResponse } from './review-queue';
import { POLL_MS, ReviewQueuePage } from './ReviewQueuePage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const labId = '8f2d1c34-5e6a-4f7b-9c10-1a2b3c4d5e6f';
const path = `/labs/${labId}/review-queue?page=0&size=20`;

const auth: AuthState = {
  session: { token: 'fake-token', role: 'ta', email: 'ta@example.test', displayName: 'TA' },
  login: vi.fn(),
  logout: vi.fn(),
};

function item(overrides: Partial<ReviewItem>): ReviewItem {
  return {
    submissionId: 'aaaaaaaa-0000-4000-8000-000000000001',
    student: { id: 'c1d2e3f4-0a1b-4c2d-8e3f-9a0b1c2d3e4f', displayName: 'Lan Nguyen' },
    submittedAt: '2026-11-10T03:15:42.120Z',
    judgeStatus: 'completed',
    verdict: 'AC',
    reviewStatus: 'checked',
    needsReview: true,
    constraints: [
      {
        code: 'C1',
        text: 'Do not call a library sort function.',
        deduction: 3,
        verdict: 'violation',
        source: 'hard_rule',
        evidence: [{ line: 12, text: '    std::sort(a, a + n);' }],
        reason: 'uses banned std::sort',
        unsureCause: null,
        needsReview: true,
      },
      {
        code: 'C2',
        text: 'Sort with a merge sort you wrote yourself.',
        deduction: 4,
        verdict: 'unsure',
        source: 'guardrail',
        evidence: [],
        reason: 'no answer within 30 s',
        unsureCause: 'timeout',
        needsReview: true,
      },
    ],
    ...overrides,
  };
}

function queue(items: ReviewItem[], overrides: Partial<QueueResponse> = {}): QueueResponse {
  return {
    labId,
    provisional: false,
    page: 0,
    size: 20,
    totalItems: items.length,
    totalPages: items.length === 0 ? 0 : 1,
    items,
    ...overrides,
  };
}

function renderAt(url: string) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/ta/review-queue" element={<ReviewQueuePage />} />
          <Route path="/ta/labs/:labId/review" element={<ReviewQueuePage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ReviewQueuePage', () => {
  beforeEach(() => {
    request.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows each submission × constraint with verdict, evidence lines, deduction and unsure cause', async () => {
    request.mockResolvedValue(queue([item({})]));
    renderAt(`/ta/labs/${labId}/review`);

    const table = await screen.findByRole('table');
    expect(request).toHaveBeenCalledWith(path, expect.anything());
    const [, first, second] = within(table).getAllByRole('row');
    if (!first || !second) throw new Error('expected two body rows');
    expect(within(first).getByText('aaaaaaaa')).toBeInTheDocument();
    expect(within(first).getByText('violation')).toBeInTheDocument();
    expect(within(first).getByText('−3')).toBeInTheDocument();
    expect(within(first).getByText('hard rule')).toBeInTheDocument();
    expect(within(first).getByText('12')).toBeInTheDocument();
    expect(within(second).getByText('unsure')).toBeInTheDocument();
    expect(within(second).getByText('guardrail')).toBeInTheDocument();
    expect(within(second).getByText('Hết thời gian chờ mô hình')).toBeInTheDocument();
    expect(screen.queryByText('Lan Nguyen')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /công bố/i })).not.toBeInTheDocument();

    fireEvent.click(first);
    const panel = screen.getByRole('complementary', { name: 'Bài nộp aaaaaaaa, ràng buộc C1' });
    const evidence = within(panel).getByRole('region', {
      name: 'Bài nộp aaaaaaaa, dòng bằng chứng 12',
    });
    expect(evidence).toHaveTextContent('std::sort(a, a + n);');
    expect(within(panel).getByText('Lý do: uses banned std::sort')).toBeInTheDocument();

    fireEvent.click(second);
    expect(screen.getByText('Nguyên nhân unsure: Hết thời gian chờ mô hình')).toBeInTheDocument();
    expect(screen.getByText('Không có dòng bằng chứng.')).toBeInTheDocument();
  });

  it('lists submissions still being checked and those not checked because they are not AC', async () => {
    request.mockResolvedValue(
      queue(
        [
          item({
            submissionId: 'bbbbbbbb-0000-4000-8000-000000000002',
            reviewStatus: 'reviewing',
            needsReview: false,
          }),
          item({
            submissionId: 'cccccccc-0000-4000-8000-000000000003',
            verdict: 'WA',
            reviewStatus: 'not_checked',
            needsReview: false,
          }),
        ],
        { provisional: true },
      ),
    );
    renderAt(`/ta/labs/${labId}/review`);

    const reviewing = await screen.findByRole('region', { name: 'Đang soát' });
    expect(within(reviewing).getByText('bbbbbbbb')).toBeInTheDocument();
    expect(within(reviewing).getByText(/đang soát/)).toBeInTheDocument();
    const notChecked = screen.getByRole('region', { name: 'Không soát' });
    expect(within(notChecked).getByText('WA')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/Tạm tính/)).toBeInTheDocument();
  });

  it('refreshes by polling so new findings appear without reloading', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    request.mockResolvedValueOnce(queue([item({ reviewStatus: 'reviewing', needsReview: false })]));
    request.mockResolvedValue(queue([item({})]));
    renderAt(`/ta/labs/${labId}/review`);

    await screen.findByRole('region', { name: 'Đang soát' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('shows the problem and stops polling when the TA may not read the lab', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    request.mockRejectedValue(
      new ApiProblemError({
        type: 'urn:leetkob:problem:lab-not-found',
        title: 'Lab not found',
        status: 404,
        detail: 'Lab not found.',
      }),
    );
    renderAt(`/ta/labs/${labId}/review`);

    expect(await screen.findByText('Lab not found')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('pages through the queue', async () => {
    request.mockResolvedValueOnce(queue([item({})], { totalItems: 21, totalPages: 2 }));
    request.mockResolvedValueOnce(
      queue([item({ needsReview: false })], { page: 1, totalItems: 21, totalPages: 2 }),
    );
    renderAt(`/ta/labs/${labId}/review`);

    fireEvent.click(await screen.findByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Trang 2/2')).toBeInTheDocument();
    expect(request).toHaveBeenLastCalledWith(
      `/labs/${labId}/review-queue?page=1&size=20`,
      expect.anything(),
    );
  });

  it('keeps the empty queue page when no lab is chosen', () => {
    renderAt('/ta/review-queue');
    expect(screen.getByRole('heading', { name: 'Hàng chờ duyệt' })).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});
