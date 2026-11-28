import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { CreateLabPage } from './CreateLabPage';
import { TaClassPage } from '../ta-classes/TaClassPage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const classId = '1b2c3d4e-0000-4000-8000-000000000001';

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/ta/classes/:classId/labs/new', element: <CreateLabPage /> },
      { path: '/ta/classes/:classId', element: <TaClassPage /> },
    ],
    { initialEntries: [`/ta/classes/${classId}/labs/new`] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function chooseFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText('Chọn file đề, ràng buộc và test'), {
    target: { files },
  });
}

const sortMerge = [
  new File(['# Sorting with merge sort\n\nRead `n` integers.\n'], 'statement.md'),
  new File(
    [
      JSON.stringify([
        { id: 'C1', text: 'Do not call a library sort function.', deduction: 3 },
        { id: 'C2', text: 'Sort with a merge sort you wrote yourself.', deduction: 4 },
      ]),
    ],
    'constraints.json',
  ),
  new File(['3\n3 1 2\n'], '01.in'),
  new File(['1 2 3\n'], '01.out'),
  new File(['1\n5\n'], '02.in'),
  new File(['5\n'], '02.out'),
];

describe('create lab form', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('fills the form from files, keeps manual edits, and posts the lab', async () => {
    const router = renderPage();
    chooseFiles(sortMerge);

    expect(await screen.findByRole('heading', { name: 'Đã nhập từ file' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Sorting with merge sort');
    expect(screen.getByLabelText('Đề bài (Markdown)')).toHaveValue(
      '# Sorting with merge sort\n\nRead `n` integers.\n',
    );
    expect(screen.getByRole('heading', { name: 'Ràng buộc (2)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Test (2)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Đầu vào 2')).toHaveValue('1\n5\n');

    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Lab 3: sắp xếp' } });
    const deductions = screen.getAllByLabelText('Khoản trừ');
    fireEvent.change(deductions[1] as HTMLElement, { target: { value: '4.5' } });
    fireEvent.change(screen.getByLabelText('Mở lúc'), { target: { value: '2026-11-24T08:00' } });
    fireEvent.change(screen.getByLabelText('Hạn nộp'), { target: { value: '2026-12-01T23:59' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xoá test 2' }));

    request.mockResolvedValueOnce({ title: 'Lab 3: sắp xếp' }).mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lab' }));

    expect(await screen.findByText('Đã tạo lab Lab 3: sắp xếp.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/ta/classes/${classId}`);
    const [path, init] = request.mock.calls[0] ?? [];
    expect(path).toBe(`/classes/${classId}/labs`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      title: 'Lab 3: sắp xếp',
      statementMd: '# Sorting with merge sort\n\nRead `n` integers.\n',
      opensAt: new Date('2026-11-24T08:00').toISOString(),
      dueAt: new Date('2026-12-01T23:59').toISOString(),
      cpuTimeMs: 1000,
      memoryMb: 256,
      tests: [{ input: '3\n3 1 2\n', expectedOutput: '1 2 3\n' }],
      constraints: [
        { code: 'C1', text: 'Do not call a library sort function.', deduction: 3 },
        { code: 'C2', text: 'Sort with a merge sort you wrote yourself.', deduction: 4.5 },
      ],
    });
  });

  it('shows field errors from the API next to the field they name, in Vietnamese', async () => {
    renderPage();
    chooseFiles(sortMerge);
    await screen.findByRole('heading', { name: 'Đã nhập từ file' });
    // UI-3: both dates are required before anything is sent.
    fireEvent.change(screen.getByLabelText('Mở lúc'), { target: { value: '2026-11-24T08:00' } });
    fireEvent.change(screen.getByLabelText('Hạn nộp'), { target: { value: '2026-12-01T23:59' } });
    request.mockRejectedValueOnce(
      new ApiProblemError({
        type: 'urn:leetkob:problem:invalid-request',
        title: 'Invalid request',
        status: 400,
        detail: 'The request is invalid.',
        errors: [{ field: 'constraints[1].code', detail: 'Duplicate code C1.' }],
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lab' }));

    // UI-3: the server's English title and field detail are never shown (problem-message.ts).
    expect(await screen.findByRole('alert')).toHaveTextContent('Dữ liệu chưa hợp lệ');
    expect(screen.getAllByLabelText('Mã')[1]).toHaveAccessibleDescription(
      'Mã có dạng C1 đến C99, không trùng nhau.',
    );
  });

  it('can start from an empty form and keeps at least one test', () => {
    renderPage();
    expect(screen.getByLabelText('Thời gian CPU (ms)')).toHaveValue(1000);
    expect(screen.getByLabelText('Bộ nhớ (MB)')).toHaveValue(256);
    expect(screen.getByRole('button', { name: 'Xoá test 1' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm ràng buộc' }));
    expect(screen.getByLabelText('Mã')).toHaveValue('C1');
  });

  it('writes the import button in sentence case, like every other button', () => {
    renderPage();
    const button = screen.getByRole('button', { name: 'Nhập từ file' });
    expect(button).toHaveTextContent(/^Nhập từ file$/);
    expect(screen.queryByText('NHẬP TỪ FILE')).toBeNull();
  });

  it('explains which files to choose for the import', () => {
    renderPage();
    expect(
      screen.getByText(
        /^Chọn cùng lúc file đề \(\.md\), file ràng buộc \(\.json\) và các file test \(NN\.in, NN\.out\)\./,
      ),
    ).toBeInTheDocument();
  });

  it('labels each test "Đầu vào N" and "Đầu ra mong đợi N" in two equal columns', async () => {
    renderPage();
    chooseFiles(sortMerge);
    await screen.findByRole('heading', { name: 'Test (2)' });
    for (const n of [1, 2]) {
      const input = screen.getByLabelText(`Đầu vào ${String(n)}`);
      const output = screen.getByLabelText(`Đầu ra mong đợi ${String(n)}`);
      const row = input.closest('.lk-cols');
      expect(row).not.toBeNull();
      expect(output.closest('.lk-cols')).toBe(row);
    }
    expect(screen.queryByLabelText(/^Input \d/)).toBeNull();
    expect(screen.queryByLabelText(/^Output \d/)).toBeNull();
    expect(screen.getByLabelText('Mở lúc').closest('.lk-cols')).toBe(
      screen.getByLabelText('Hạn nộp').closest('.lk-cols'),
    );
    expect(screen.getByLabelText('Thời gian CPU (ms)').closest('.lk-cols')).toBe(
      screen.getByLabelText('Bộ nhớ (MB)').closest('.lk-cols'),
    );
  });

  it('gives the columns equal widths in the stylesheet', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/ui/ui-extra.css'), 'utf8');
    expect(css).toMatch(
      /\.lk-cols\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
  });
});
