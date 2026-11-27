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
const path = `/labs/${labId}/review-queue?page=0&size=20&includeEarlier=true`;

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

    expect(await screen.findByText('Không tìm thấy lab')).toBeInTheDocument();
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
      `/labs/${labId}/review-queue?page=1&size=20&includeEarlier=true`,
      expect.anything(),
    );
  });

  it('lists earlier AC submissions under the counted ones, marked as not counted', async () => {
    request.mockResolvedValue(
      queue([
        item({ counted: true }),
        item({ submissionId: 'dddddddd-0000-4000-8000-000000000004', counted: false }),
        item({
          submissionId: 'eeeeeeee-0000-4000-8000-000000000005',
          counted: false,
          reviewStatus: 'reviewing',
          needsReview: false,
        }),
      ]),
    );
    renderAt(`/ta/labs/${labId}/review`);

    const earlier = await screen.findByRole('region', { name: 'Bài nộp trước (không được tính)' });
    const [countedTable, earlierTable] = screen.getAllByRole('table');
    if (!countedTable || !earlierTable) throw new Error('expected two tables');
    expect(within(earlier).getByRole('table')).toBe(earlierTable);
    expect(within(countedTable).getAllByText('aaaaaaaa')).toHaveLength(2);
    expect(within(countedTable).queryByText('dddddddd')).not.toBeInTheDocument();
    expect(within(earlierTable).getAllByText('dddddddd')).toHaveLength(2);
    expect(within(earlierTable).queryByText('aaaaaaaa')).not.toBeInTheDocument();
    expect(within(earlier).getByText('eeeeeeee')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Đang soát' })).not.toBeInTheDocument();
    expect(
      countedTable.compareDocumentPosition(earlier) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const [, firstEarlier] = within(earlierTable).getAllByRole('row');
    if (!firstEarlier) throw new Error('expected an earlier row');
    fireEvent.click(firstEarlier);
    const panel = within(earlier).getByRole('complementary', {
      name: 'Bài nộp dddddddd, ràng buộc C1',
    });
    expect(within(panel).getByRole('heading')).toHaveTextContent(
      'C1 · bài nộp dddddddd (không được tính)',
    );
  });

  it('shows no earlier section when every item is counted', async () => {
    request.mockResolvedValue(queue([item({ counted: true })]));
    renderAt(`/ta/labs/${labId}/review`);

    await screen.findByRole('table');
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(
      screen.queryByRole('region', { name: 'Bài nộp trước (không được tính)' }),
    ).not.toBeInTheDocument();
  });

  it('shows the deduction as −N only for violation and unsure; pass says no deduction', async () => {
    const [violation] = item({}).constraints;
    if (!violation) throw new Error('expected a constraint');
    request.mockResolvedValue(
      queue([
        item({
          constraints: [
            violation,
            {
              code: 'C2',
              text: 'Sort with a merge sort you wrote yourself.',
              deduction: 4,
              verdict: 'pass',
              source: 'model',
              evidence: [],
              reason: 'own merge sort',
              unsureCause: null,
              needsReview: false,
            },
          ],
        }),
      ]),
    );
    renderAt(`/ta/labs/${labId}/review`);

    const table = await screen.findByRole('table');
    const [, first, second] = within(table).getAllByRole('row');
    if (!first || !second) throw new Error('expected two body rows');
    expect(within(first).getByText('−3')).toBeInTheDocument();
    expect(within(second).getByText('Không trừ (mức trừ nếu vi phạm: 4)')).toBeInTheDocument();
    expect(screen.queryByText('−4')).not.toBeInTheDocument();

    fireEvent.click(second);
    const panel = screen.getByRole('complementary', { name: 'Bài nộp aaaaaaaa, ràng buộc C2' });
    expect(within(panel).getByText(/Khoản trừ:/)).toHaveTextContent(
      'pass Khoản trừ: Không trừ (mức trừ nếu vi phạm: 4)',
    );
    expect(within(panel).queryByText(/−4/)).not.toBeInTheDocument();

    fireEvent.click(first);
    const violationPanel = screen.getByRole('complementary', {
      name: 'Bài nộp aaaaaaaa, ràng buộc C1',
    });
    expect(within(violationPanel).getByText(/Khoản trừ:/)).toHaveTextContent(
      'violation Khoản trừ: −3',
    );
  });

  it('clips the constraint text in the table and shows it in full in the panel', async () => {
    const long =
      'Do not call any library sort function such as std::sort, std::stable_sort, qsort or ' +
      'std::ranges::sort anywhere in the submitted program, including helper functions.';
    const [first, second] = item({}).constraints;
    if (!first || !second) throw new Error('expected two constraints');
    request.mockResolvedValue(queue([item({ constraints: [{ ...first, text: long }, second] })]));
    renderAt(`/ta/labs/${labId}/review`);

    const table = await screen.findByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers).toEqual([
      'Bài nộp',
      'Ràng buộc',
      'Khoản trừ',
      'Nguồn',
      'Kết luận',
      'Bằng chứng',
    ]);
    const [, row] = within(table).getAllByRole('row');
    if (!row) throw new Error('expected a body row');
    const cell = within(row).getByText(`C1 ${long}`);
    expect(cell).toHaveClass('lk-table__clip');
    expect(cell).toHaveAttribute('title', `C1 ${long}`);

    fireEvent.click(row);
    const panel = screen.getByRole('complementary', { name: 'Bài nộp aaaaaaaa, ràng buộc C1' });
    expect(within(panel).getByText(long)).toBeInTheDocument();
  });

  it('shows the 404 problem in Vietnamese without the English title', async () => {
    request.mockRejectedValue(
      new ApiProblemError({
        type: 'urn:leetkob:problem:lab-not-found',
        title: 'Lab not found',
        status: 404,
        detail: 'Lab not found.',
      }),
    );
    renderAt(`/ta/labs/${labId}/review`);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Không tìm thấy lab')).toBeInTheDocument();
    expect(
      within(alert).getByText('Lab không tồn tại hoặc bạn không phải TA của lớp có lab này.'),
    ).toBeInTheDocument();
    expect(within(alert).queryByText(/Lab not found/)).not.toBeInTheDocument();
  });

  it('keeps other problems as the server sent them', async () => {
    request.mockRejectedValue(
      new ApiProblemError({
        type: 'urn:leetkob:problem:forbidden-role',
        title: 'Role is not allowed to submit',
        status: 403,
        detail: 'Only a TA of the class can read the review queue.',
      }),
    );
    renderAt(`/ta/labs/${labId}/review`);

    expect(await screen.findByText('Role is not allowed to submit')).toBeInTheDocument();
  });

  it('keeps the empty queue page when no lab is chosen', () => {
    renderAt('/ta/review-queue');
    expect(screen.getByRole('heading', { name: 'Hàng chờ duyệt' })).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});
