import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { AuthContext, type AuthState } from '../../app/auth-context';
import {
  formatSubmittedAt,
  studentLabel,
  type ReviewItem,
  type ReviewQueuePage as QueueResponse,
} from './review-queue';
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

/**
 * The page also reads the lab and its class for the header (A4, audit 2026-11-28); those answer
 * fixed data here, and every other path goes to `queueRequest`, which the tests below drive.
 */
const queueRequest = vi.fn<ApiClient['request']>();
const labDetail = {
  id: labId,
  classId: '1b2c3d4e-0000-4000-8000-000000000001',
  title: 'Sorting with merge sort',
  statementMd: '# Sorting',
  opensAt: '2026-11-03T01:00:00Z',
  dueAt: '2026-11-10T16:59:00Z',
  cpuTimeMs: 1000,
  wallTimeMs: 3000,
  memoryMb: 256,
  constraints: [],
};

describe('ReviewQueuePage', () => {
  beforeEach(() => {
    request.mockReset();
    queueRequest.mockReset();
    request.mockImplementation((requestPath, init) => {
      if (requestPath === `/labs/${labId}`) return Promise.resolve(labDetail);
      if (requestPath.startsWith('/classes/')) {
        return Promise.resolve({ id: labDetail.classId, name: 'CTT1' });
      }
      return queueRequest(requestPath, init);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows each submission × constraint with verdict, evidence lines, deduction and unsure cause', async () => {
    queueRequest.mockResolvedValue(queue([item({})]));
    renderAt(`/ta/labs/${labId}/review`);

    const table = await screen.findByRole('table');
    expect(queueRequest).toHaveBeenCalledWith(path, expect.anything());
    const [, first, second] = within(table).getAllByRole('row');
    if (!first || !second) throw new Error('expected two body rows');
    expect(
      within(table.closest('section') as HTMLElement).getByText('aaaaaaaa'),
    ).toBeInTheDocument();
    expect(table.closest('section')).toHaveAccessibleName('Bài nộp aaaaaaaa');
    expect(within(first).getByText('violation')).toBeInTheDocument();
    expect(within(first).getByText('−3')).toBeInTheDocument();
    // A16 (audit 2026-11-28): the source is named in Vietnamese; the API value is unchanged.
    expect(within(first).getByText('Luật cứng')).toBeInTheDocument();
    expect(within(first).getByText('dòng 12')).toBeInTheDocument();
    expect(within(second).getByText('unsure')).toBeInTheDocument();
    expect(within(second).getByText('Chặn an toàn')).toBeInTheDocument();
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
    queueRequest.mockResolvedValue(
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

    const reviewing = await screen.findByRole('region', { name: 'Bài nộp bbbbbbbb' });
    expect(within(reviewing).getByText('bbbbbbbb')).toBeInTheDocument();
    expect(within(reviewing).getByText('Đang soát ràng buộc…')).toBeInTheDocument();
    const notChecked = screen.getByRole('region', { name: 'Bài nộp cccccccc' });
    expect(within(notChecked).getByText('WA')).toBeInTheDocument();
    expect(
      within(notChecked).getByText('Không soát ràng buộc: chấm test chưa AC.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/Tạm tính/)).toBeInTheDocument();
  });

  it('refreshes by polling so new findings appear without reloading', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    queueRequest.mockResolvedValueOnce(
      queue([item({ reviewStatus: 'reviewing', needsReview: false })]),
    );
    queueRequest.mockResolvedValue(queue([item({})]));
    renderAt(`/ta/labs/${labId}/review`);

    await screen.findByText('Đang soát ràng buộc…');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(queueRequest).toHaveBeenCalledTimes(2);
  });

  it('shows the problem and stops polling when the TA may not read the lab', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    queueRequest.mockRejectedValue(
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
    expect(queueRequest).toHaveBeenCalledTimes(1);
  });

  it('pages through the queue', async () => {
    queueRequest.mockResolvedValueOnce(queue([item({})], { totalItems: 21, totalPages: 2 }));
    queueRequest.mockResolvedValueOnce(
      queue([item({ needsReview: false })], { page: 1, totalItems: 21, totalPages: 2 }),
    );
    renderAt(`/ta/labs/${labId}/review`);

    fireEvent.click(await screen.findByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Trang 2/2')).toBeInTheDocument();
    expect(queueRequest).toHaveBeenLastCalledWith(
      `/labs/${labId}/review-queue?page=1&size=20&includeEarlier=true`,
      expect.anything(),
    );
  });

  it('lists earlier AC submissions under the counted ones, marked as not counted', async () => {
    queueRequest.mockResolvedValue(
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

    const earlier = await screen.findByRole('region', {
      name: 'Các lần nộp cũ hơn (không tính điểm)',
    });
    expect(
      within(earlier).getByText('Bài AC sinh viên nộp trước lần được tính, chỉ để tham khảo.'),
    ).toBeInTheDocument();
    expect(within(earlier).getByRole('heading', { level: 2 }).textContent).toBe(
      'Các lần nộp cũ hơn (không tính điểm)',
    );
    expect(screen.queryByText('Các lần nộp trước của sinh viên')).toBeNull();
    const counted = screen.getByRole('region', { name: 'Bài nộp aaaaaaaa' });
    const earlierBlock = within(earlier).getByRole('region', { name: 'Bài nộp dddddddd' });
    const reviewingBlock = within(earlier).getByRole('region', { name: 'Bài nộp eeeeeeee' });
    expect(within(counted).getByText('Được tính điểm')).toBeInTheDocument();
    expect(within(earlierBlock).queryByText('Được tính điểm')).not.toBeInTheDocument();
    expect(within(earlier).queryByRole('region', { name: 'Bài nộp aaaaaaaa' })).toBeNull();
    expect(within(reviewingBlock).getByText('Đang soát ràng buộc…')).toBeInTheDocument();
    expect(
      counted.compareDocumentPosition(earlier) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const [, firstEarlier] = within(within(earlierBlock).getByRole('table')).getAllByRole('row');
    if (!firstEarlier) throw new Error('expected an earlier row');
    fireEvent.click(firstEarlier);
    const panel = screen.getByRole('complementary', { name: 'Bài nộp dddddddd, ràng buộc C1' });
    expect(within(panel).getByRole('heading')).toHaveTextContent(
      'C1 · bài nộp dddddddd (không được tính)',
    );
  });

  it('gives every submission block a badge: counted, or a neutral "Không tính điểm"', async () => {
    queueRequest.mockResolvedValue(
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

    const counted = await screen.findByRole('region', { name: 'Bài nộp aaaaaaaa' });
    expect(within(counted).getByText('Được tính điểm')).toHaveClass('lk-tag');
    expect(within(counted).getByText('Được tính điểm')).not.toHaveClass('lk-tag--muted');
    expect(within(counted).queryByText('Không tính điểm')).toBeNull();
    expect(counted).not.toHaveClass('lk-submission--earlier');

    for (const name of ['Bài nộp dddddddd', 'Bài nộp eeeeeeee']) {
      const block = screen.getByRole('region', { name });
      const badge = within(block).getByText('Không tính điểm');
      expect(badge).toHaveClass('lk-tag', 'lk-tag--muted');
      expect(within(block).queryByText('Được tính điểm')).toBeNull();
      expect(block).toHaveClass('lk-panel', 'lk-submission', 'lk-submission--earlier');
    }

    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    expect(css).toMatch(
      /\.lk-tag\.lk-tag--muted \{[^}]*background: var\(--surface-sunken\);[^}]*color: var\(--ink-muted\);/,
    );
    expect(css).toMatch(
      /\.lk-submission\.lk-submission--earlier \{[^}]*background: var\(--surface\);[^}]*border-style: dashed;/,
    );
  });

  it('shows no earlier section when every item is counted', async () => {
    queueRequest.mockResolvedValue(queue([item({ counted: true })]));
    renderAt(`/ta/labs/${labId}/review`);

    await screen.findByRole('table');
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(
      screen.queryByRole('region', { name: 'Các lần nộp cũ hơn (không tính điểm)' }),
    ).not.toBeInTheDocument();
  });

  it('heads each submission with an anonymous student, the full time and the test result', async () => {
    const student = 'c1d2e3f4-0a1b-4c2d-8e3f-9a0b1c2d3e4f';
    const other = 'c1d2e3f4-0a1b-4c2d-8e3f-9a0b1c2d3e50';
    queueRequest.mockResolvedValue(
      queue([
        item({ counted: true, submittedAt: '2026-11-27T07:15:42.120Z' }),
        item({
          submissionId: 'ffffffff-0000-4000-8000-000000000006',
          student: { id: other, displayName: 'Minh Tran' },
          counted: true,
          verdict: 'WA',
          reviewStatus: 'not_checked',
          needsReview: false,
        }),
      ]),
    );
    renderAt(`/ta/labs/${labId}/review`);

    const block = await screen.findByRole('region', { name: 'Bài nộp aaaaaaaa' });
    const label = studentLabel(student);
    expect(label).toMatch(/^Sinh viên [0-9A-F]{4}$/);
    expect(studentLabel(student)).toBe(label);
    expect(studentLabel(other)).not.toBe(label);
    expect(within(block).getByRole('heading', { name: label })).toBeInTheDocument();
    expect(within(block).getByText('Được tính điểm')).toBeInTheDocument();
    const time = within(block).getByText(formatSubmittedAt('2026-11-27T07:15:42.120Z'));
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', '2026-11-27T07:15:42.120Z');
    expect(time.textContent).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}:42$/);
    expect(within(block).getByText('AC')).toBeInTheDocument();
    const wrong = screen.getByRole('region', { name: 'Bài nộp ffffffff' });
    expect(within(wrong).getByRole('heading', { name: studentLabel(other) })).toBeInTheDocument();
    expect(within(wrong).getByText('WA')).toBeInTheDocument();
    expect(screen.queryByText(/Lan Nguyen|Minh Tran/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Kết quả soát ràng buộc của từng bài, chờ trợ giảng xác nhận trước khi công bố điểm.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the deduction as −N only for violation and unsure; pass reads 0 (−N nếu vi phạm)', async () => {
    const [violation] = item({}).constraints;
    if (!violation) throw new Error('expected a constraint');
    queueRequest.mockResolvedValue(
      queue([
        item({
          constraints: [
            {
              ...violation,
              evidence: [
                { line: 9, text: 'a' },
                { line: 10, text: 'b' },
              ],
            },
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
    expect(within(first).getByText('dòng 9, 10')).toBeInTheDocument();
    expect(within(second).getByText('0 (−4 nếu vi phạm)')).toBeInTheDocument();
    expect(within(second).getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('−4')).not.toBeInTheDocument();

    fireEvent.click(second);
    const panel = screen.getByRole('complementary', { name: 'Bài nộp aaaaaaaa, ràng buộc C2' });
    expect(within(panel).getByText(/Khoản trừ:/)).toHaveTextContent(
      'pass Khoản trừ: 0 (−4 nếu vi phạm)',
    );

    fireEvent.click(first);
    const violationPanel = screen.getByRole('complementary', {
      name: 'Bài nộp aaaaaaaa, ràng buộc C1',
    });
    expect(within(violationPanel).getByText(/Khoản trừ:/)).toHaveTextContent(
      'violation Khoản trừ: −3',
    );
  });

  it('wraps the full constraint text with inline code; the panel sits beside the blocks', async () => {
    const long =
      'Do not call any library sort function such as `std::sort`, `std::stable_sort`, `qsort` ' +
      'or `std::ranges::sort` anywhere in the submitted program, including helper functions.';
    const plain = long.replaceAll('`', '');
    const [first, second] = item({}).constraints;
    if (!first || !second) throw new Error('expected two constraints');
    queueRequest.mockResolvedValue(
      queue([item({ constraints: [{ ...first, text: long }, second] })]),
    );
    const { container } = renderAt(`/ta/labs/${labId}/review`);

    const table = await screen.findByRole('table', { name: 'Ràng buộc của bài nộp aaaaaaaa' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(headers).toEqual(['Ràng buộc', 'Khoản trừ', 'Nguồn', 'Kết luận', 'Bằng chứng']);
    const [, row, other] = within(table).getAllByRole('row');
    if (!row || !other) throw new Error('expected two body rows');
    const cell = within(row).getAllByRole('cell')[0];
    if (!cell) throw new Error('expected a constraint cell');
    expect(cell).toHaveClass('lk-wrap');
    expect(cell.textContent).toBe(`C1 ${plain}`);
    expect(within(cell).getByText('std::sort').tagName).toBe('CODE');

    const layout = container.querySelector('.lk-review');
    const aside = container.querySelector('.lk-review__aside');
    if (!layout || !aside) throw new Error('expected the two-column layout');
    expect(aside.parentElement).toBe(layout);
    expect(
      within(aside as HTMLElement).getByRole('complementary', { name: 'Chi tiết ràng buộc' }),
    ).toHaveTextContent('Chọn một dòng để xem lý do và dòng bằng chứng.');

    fireEvent.click(row);
    const panel = within(aside as HTMLElement).getByRole('complementary', {
      name: 'Bài nộp aaaaaaaa, ràng buộc C1',
    });
    expect(panel.textContent).toContain(plain);
    expect(table.isConnected).toBe(true);
    fireEvent.click(other);
    expect(
      within(aside as HTMLElement).getByRole('complementary', {
        name: 'Bài nộp aaaaaaaa, ràng buộc C2',
      }),
    ).toBeInTheDocument();
    expect(aside.parentElement).toBe(layout);
    expect(container.querySelectorAll('aside')).toHaveLength(1);
  });

  it('shows the 404 problem in Vietnamese without the English title', async () => {
    queueRequest.mockRejectedValue(
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

  // A4 (audit 2026-11-28): /ta/labs only redirected to the class list, so the 404 now links
  // there directly and says so.
  it('on 404 drops the auto-refresh note and links back to Lớp của tôi', async () => {
    queueRequest.mockRejectedValue(
      new ApiProblemError({
        type: 'urn:leetkob:problem:lab-not-found',
        title: 'Lab not found',
        status: 404,
      }),
    );
    renderAt(`/ta/labs/${labId}/review`);

    await screen.findByRole('alert');
    expect(screen.queryByText(/Tự làm mới/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về Lớp của tôi' })).toHaveAttribute(
      'href',
      '/ta/classes',
    );
  });

  it('keeps the auto-refresh note while the queue loads normally', async () => {
    queueRequest.mockResolvedValue(queue([item({})]));
    renderAt(`/ta/labs/${labId}/review`);

    expect(await screen.findByText(/Tự làm mới mỗi 15 giây/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Về Lớp của tôi' })).toBeNull();
  });

  it('shows other problems in Vietnamese, never the server title', async () => {
    queueRequest.mockRejectedValue(
      new ApiProblemError({
        type: 'urn:leetkob:problem:forbidden-role',
        title: 'Role is not allowed to submit',
        status: 403,
        detail: 'Only a TA of the class can read the review queue.',
      }),
    );
    renderAt(`/ta/labs/${labId}/review`);

    // UI-3: problem-message.ts replaces the English title of every problem.
    expect(
      await screen.findByText('Bạn không có quyền thực hiện thao tác này'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Role is not allowed to submit')).toBeNull();
  });

  it('keeps the empty queue page when no lab is chosen', () => {
    renderAt('/ta/review-queue');
    expect(screen.getByRole('heading', { name: 'Hàng chờ duyệt' })).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});
