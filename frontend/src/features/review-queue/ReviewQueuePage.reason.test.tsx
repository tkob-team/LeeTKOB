import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { AuthContext, type AuthState } from '../../app/auth-context';
import { reasonText, type ConstraintFinding, type ReviewItem } from './review-queue';
import { ReviewQueuePage } from './ReviewQueuePage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const labId = '8f2d1c34-5e6a-4f7b-9c10-1a2b3c4d5e6f';

const auth: AuthState = {
  session: { token: 't', role: 'ta', email: 'ta@leetkob.test', displayName: 'TA' },
  login: vi.fn(),
  logout: vi.fn(),
};

function finding(overrides: Partial<ConstraintFinding>): ConstraintFinding {
  return {
    code: 'C1',
    text: 'Do not call a library sort function: `std::sort`.',
    deduction: 3,
    verdict: 'violation',
    source: 'hard_rule',
    evidence: [{ line: 11, text: '    sort(a.begin(), a.end());' }],
    reason: 'uses banned `std::sort`',
    unsureCause: null,
    needsReview: true,
    ...overrides,
  };
}

function renderQueue(constraints: ConstraintFinding[]) {
  const item: ReviewItem = {
    submissionId: '24cda35f-0000-4000-8000-000000000001',
    counted: true,
    student: { id: 'sv1', displayName: null },
    submittedAt: '2026-11-28T07:59:02.000Z',
    judgeStatus: 'completed',
    verdict: 'AC',
    reviewStatus: 'checked',
    needsReview: true,
    constraints,
  };
  request.mockResolvedValue({
    labId,
    provisional: true,
    page: 0,
    size: 20,
    totalItems: 1,
    totalPages: 1,
    items: [item],
  });
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

async function openPanel(code: string): Promise<HTMLElement> {
  const table = await screen.findByRole('table');
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => candidate.textContent.includes(code));
  if (!row) throw new Error(`no row for ${code}`);
  fireEvent.click(row);
  return screen.getByRole('complementary', { name: new RegExp(`ràng buộc ${code}$`) });
}

beforeEach(() => {
  request.mockReset();
});

describe('review queue panel: reason', () => {
  it('shows a hard-rule reason in Vietnamese with the banned name as inline code', async () => {
    renderQueue([finding({})]);
    const panel = await openPanel('C1');
    const reason = within(panel).getByText(/^Lý do:/);
    expect(reason).toHaveTextContent('Lý do: Dùng hàm bị cấm std::sort.');
    expect(within(reason).getByText('std::sort').tagName).toBe('CODE');
    expect(reason.textContent).not.toContain('`');
    expect(panel).not.toHaveTextContent('uses banned');
  });

  it('keeps a model reason as written, with `code` as inline code', async () => {
    renderQueue([
      finding({
        code: 'C2',
        text: 'Sort with a merge sort you wrote yourself.',
        source: 'model',
        reason: 'uses `std::sort` instead of implementing a merge sort',
      }),
    ]);
    const panel = await openPanel('C2');
    const reason = within(panel).getByText(/^Lý do:/);
    expect(reason).toHaveTextContent('Lý do: uses std::sort instead of implementing a merge sort');
    expect(within(reason).getByText('std::sort').tagName).toBe('CODE');
  });
});

describe('reasonText', () => {
  it.each([
    ['uses banned `std::sort`', 'Dùng hàm bị cấm `std::sort`.'],
    ['uses banned `qsort`, `std::sort`', 'Dùng hàm bị cấm `qsort`, `std::sort`.'],
    ['no banned name is used', 'Không dùng hàm bị cấm.'],
    ['the source could not be parsed', 'Không phân tích được mã nguồn, cần trợ giảng xem.'],
    ['something new from the checker', 'something new from the checker'],
  ])('hard rule "%s" reads "%s"', (reason, expected) => {
    expect(reasonText({ source: 'hard_rule', reason })).toBe(expected);
  });

  it('never rewrites a model or guardrail reason, even one that looks like a hard rule', () => {
    expect(reasonText({ source: 'model', reason: 'uses banned `std::sort`' })).toBe(
      'uses banned `std::sort`',
    );
    expect(reasonText({ source: 'guardrail', reason: 'no answer within 30 s' })).toBe(
      'no answer within 30 s',
    );
    expect(reasonText({ source: 'hard_rule', reason: null })).toBeNull();
  });
});
