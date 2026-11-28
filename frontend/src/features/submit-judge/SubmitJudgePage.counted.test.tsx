import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { formatDateTime } from '../lab-authoring/lab-api';
import { SubmitJudgePage } from './SubmitJudgePage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const labId = '00000000-0000-4000-8000-000000000001';
const submissionId = '3f2a9c1d-0000-4000-8000-000000000002';
const dueAt = '2026-12-01T16:59:00.000Z';

function serve(lab: Record<string, unknown>) {
  request.mockImplementation((path: string) => {
    if (path === '/student/labs') return Promise.resolve([{ id: labId, title: 'Lab', ...lab }]);
    return Promise.resolve({
      status: 'completed',
      counted: true,
      verdict: 'AC',
      tests: [{ number: 1, verdict: 'AC' }],
    });
  });
}

function renderPage() {
  render(
    <MemoryRouter>
      <SubmitJudgePage />
    </MemoryRouter>,
  );
}

describe('submit page: what counts, before "Nộp bài" (A9)', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('says the last submission before the deadline counts when nothing is submitted', async () => {
    serve({ latestSubmissionId: null, dueAt, latestVerdict: null });
    renderPage();
    expect(
      await screen.findByText('Bài nộp cuối cùng trước hạn sẽ được tính.'),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Hạn nộp ${formatDateTime(dueAt)}`))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem đề bài' })).toHaveAttribute(
      'href',
      `/student/labs/${labId}`,
    );
  });

  it('warns that a new submission replaces the counted one, naming its verdict', async () => {
    serve({ latestSubmissionId: submissionId, dueAt, latestVerdict: 'AC' });
    renderPage();
    expect(
      await screen.findByText(
        'Bài được tính hiện tại: AC. Lần nộp này sẽ thay bài được tính, dù kết quả thế nào.',
      ),
    ).toBeInTheDocument();
    // The note sits under the button, inside the form.
    const note = screen.getByText(/Lần nộp này sẽ thay bài được tính/);
    expect(note.closest('form')).toBe(
      screen.getByRole('button', { name: 'Nộp bài' }).closest('form'),
    );
  });

  it('works outside a router too (plain link to the statement)', async () => {
    serve({ latestSubmissionId: null, dueAt });
    render(<SubmitJudgePage />);
    expect(await screen.findByRole('link', { name: 'Xem đề bài' })).toHaveAttribute(
      'href',
      `/student/labs/${labId}`,
    );
  });
});

describe('submit page: short submission id with a copy button (A10)', () => {
  const writeText = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    request.mockReset();
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('shows the first 8 characters, the full id in its title, and copies the full id', async () => {
    serve({ latestSubmissionId: submissionId, dueAt, latestVerdict: 'AC' });
    renderPage();
    const label = await screen.findByTitle(submissionId);
    expect(label).toHaveTextContent(/^3f2a9c1d$/);
    expect(label).toHaveClass('lk-mono');
    expect(screen.queryByText(submissionId)).toBeNull();

    const copy = screen.getByRole('button', { name: `Sao chép mã bài nộp ${submissionId}` });
    expect(copy).toHaveTextContent('Sao chép');
    await act(async () => {
      fireEvent.click(copy);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(submissionId);
    expect(copy).toHaveTextContent('Đã sao chép');
    // Still one status region on the page: the grading result.
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('keeps the page within 375 px: the lab picker may shrink (stylesheet)', () => {
    // jsdom has no layout: check the rules that cap the <select> and let its column shrink.
    const css = readFileSync(join(process.cwd(), 'src/app/shell.css'), 'utf8');
    expect(css).toMatch(/\.lk-field select \{\s*max-width: 100%;\s*min-width: 0;/);
    expect(css).toMatch(/\.lk-submit \.lk-field \{\s*grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).toMatch(
      /\.lk-submit \.lk-field select \{\s*box-sizing: border-box;\s*width: 100%;/,
    );
  });
});
