import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { CreateLabPage } from './CreateLabPage';
import { errorSummary, labFormErrors, type LabFormValues } from './lab-form-check';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const classId = '1b2c3d4e-0000-4000-8000-000000000001';
const scrollIntoView = vi.fn();

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/ta/classes/:classId/labs/new', element: <CreateLabPage /> },
      { path: '/ta/classes/:classId', element: <p>Lab list</p> },
    ],
    { initialEntries: [`/ta/classes/${classId}/labs/new`] },
  );
  render(<RouterProvider router={router} />);
}

const field = (label: string) => screen.getByLabelText(label);
const type = (label: string, value: string) => {
  fireEvent.change(field(label), { target: { value } });
};
const create = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Tạo lab' }));
};

beforeEach(() => {
  request.mockReset();
  scrollIntoView.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

describe('create lab: every required field is checked before sending (A14)', () => {
  it('reports title, statement, both dates and the test output at once, focusing the title', () => {
    renderPage();
    create();
    expect(field('Tiêu đề')).toHaveAccessibleDescription('Nhập tiêu đề, tối đa 200 ký tự.');
    expect(field('Đề bài (Markdown)')).toHaveAccessibleDescription(
      'Nhập đề bài, tối đa 65.536 ký tự.',
    );
    expect(field('Mở lúc')).toHaveAccessibleDescription('Chọn thời điểm mở lab.');
    expect(field('Hạn nộp')).toHaveAccessibleDescription('Chọn hạn nộp.');
    expect(field('Đầu ra mong đợi 1')).toHaveAccessibleDescription('Nhập đầu ra mong đợi.');
    expect(field('Tiêu đề')).toHaveFocus();
    expect(scrollIntoView.mock.contexts[0]).toBe(field('Tiêu đề'));
    expect(screen.getByText('Còn 5 trường cần sửa.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('puts the summary beside the "Tạo lab" button', () => {
    renderPage();
    create();
    const summary = screen.getByText('Còn 5 trường cần sửa.');
    expect(summary).toHaveAttribute('role', 'status');
    expect(summary.parentElement).toBe(
      screen.getByRole('button', { name: 'Tạo lab' }).closest('.lk-row'),
    );
  });

  it('drops a field error as soon as that field is edited, and counts down', () => {
    renderPage();
    create();
    type('Tiêu đề', 'Lab 1');
    expect(field('Tiêu đề')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Còn 4 trường cần sửa.')).toBeInTheDocument();
    type('Đề bài (Markdown)', '# Lab 1');
    type('Đầu ra mong đợi 1', '3');
    expect(screen.getByText('Còn 2 trường cần sửa.')).toBeInTheDocument();
  });

  it('goes to the first wrong field in page order: CPU before memory', () => {
    renderPage();
    type('Tiêu đề', 'Lab');
    type('Đề bài (Markdown)', '# Lab');
    type('Mở lúc', '2026-12-01T08:00');
    type('Hạn nộp', '2026-12-08T08:00');
    type('Đầu ra mong đợi 1', '1');
    type('Thời gian CPU (ms)', '999');
    type('Bộ nhớ (MB)', '1024');
    create();
    expect(field('Thời gian CPU (ms)')).toHaveFocus();
    expect(field('Thời gian CPU (ms)')).toHaveAccessibleDescription(
      'Thời gian CPU phải là số nguyên từ 1000 đến 5000 ms.',
    );
    expect(field('Bộ nhớ (MB)')).toHaveAccessibleDescription(
      'Bộ nhớ phải là số nguyên từ 64 đến 512 MB.',
    );
    expect(screen.getByText('Còn 2 trường cần sửa.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('sends the lab once everything required is filled in, with no summary left', async () => {
    renderPage();
    type('Tiêu đề', 'Lab');
    type('Đề bài (Markdown)', '# Lab');
    type('Mở lúc', '2026-12-01T08:00');
    type('Hạn nộp', '2026-12-08T08:00');
    type('Đầu ra mong đợi 1', '1');
    request.mockResolvedValueOnce({ title: 'Lab' });
    create();
    expect(await screen.findByText('Lab list')).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('labFormErrors', () => {
  const valid: LabFormValues = {
    title: 'Lab',
    statementMd: '# Lab',
    opensAt: '2026-12-01T08:00',
    dueAt: '2026-12-08T08:00',
    cpuTimeMs: '1000',
    memoryMb: '256',
    tests: [{ input: '', expectedOutput: '1' }],
  };

  it('accepts a complete lab (a test input may be empty)', () => {
    expect(labFormErrors(valid)).toEqual({});
  });

  it('rejects a blank title, a title over 200 characters and a blank statement', () => {
    expect(Object.keys(labFormErrors({ ...valid, title: '   ' }))).toEqual(['title']);
    expect(Object.keys(labFormErrors({ ...valid, title: 'x'.repeat(201) }))).toEqual(['title']);
    expect(labFormErrors({ ...valid, title: 'x'.repeat(200) })).toEqual({});
    expect(Object.keys(labFormErrors({ ...valid, statementMd: '\n ' }))).toEqual(['statementMd']);
  });

  it.each([
    ['cpuTimeMs', '1000', true],
    ['cpuTimeMs', '5000', true],
    ['cpuTimeMs', '5001', false],
    ['cpuTimeMs', '1500.5', false],
    ['memoryMb', '64', true],
    ['memoryMb', '63', false],
    ['memoryMb', '512', true],
    ['memoryMb', '', false],
  ] as const)('%s = "%s" is valid: %s', (name, value, ok) => {
    expect(name in labFormErrors({ ...valid, [name]: value })).toBe(!ok);
  });

  it('names the test whose expected output is missing', () => {
    const errors = labFormErrors({
      ...valid,
      tests: [
        { input: '1', expectedOutput: '1' },
        { input: '2', expectedOutput: '' },
      ],
    });
    expect(errors).toEqual({ 'tests[1].expectedOutput': 'Nhập đầu ra mong đợi.' });
  });

  it('writes the summary only when something is wrong', () => {
    expect(errorSummary(0)).toBe('');
    expect(errorSummary(3)).toBe('Còn 3 trường cần sửa.');
  });
});
