import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemError, type ApiClient } from '../../api/client';
import { CreateLabPage } from './CreateLabPage';
import { dateErrors, toIso } from './lab-dates';

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

const opensAt = () => screen.getByLabelText('Mở lúc');
const dueAt = () => screen.getByLabelText('Hạn nộp');
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

describe('create lab: Mở lúc and Hạn nộp', () => {
  it('are required: errors under both, focus and scroll to Mở lúc, nothing sent', () => {
    renderPage();
    expect(opensAt()).toBeRequired();
    expect(dueAt()).toBeRequired();
    create();

    expect(opensAt()).toHaveAccessibleDescription('Chọn thời điểm mở lab.');
    expect(dueAt()).toHaveAccessibleDescription('Chọn hạn nộp.');
    expect(opensAt()).toHaveAttribute('aria-invalid', 'true');
    expect(opensAt()).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(opensAt());
    expect(request).not.toHaveBeenCalled();
  });

  it('goes to Hạn nộp when only Hạn nộp is missing', () => {
    renderPage();
    fireEvent.change(opensAt(), { target: { value: '2026-12-01T08:00' } });
    create();
    expect(opensAt()).not.toHaveAttribute('aria-invalid');
    expect(dueAt()).toHaveAccessibleDescription('Chọn hạn nộp.');
    expect(dueAt()).toHaveFocus();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['before', '2026-11-30T08:00'],
    ['equal to', '2026-12-01T08:00'],
  ])('reports Hạn nộp %s Mở lúc under both fields', (_, due) => {
    renderPage();
    fireEvent.change(opensAt(), { target: { value: '2026-12-01T08:00' } });
    fireEvent.change(dueAt(), { target: { value: due } });
    create();
    expect(opensAt()).toHaveAccessibleDescription('Mở lúc phải trước Hạn nộp.');
    expect(dueAt()).toHaveAccessibleDescription('Hạn nộp phải sau Mở lúc.');
    expect(opensAt()).toHaveFocus();
    expect(request).not.toHaveBeenCalled();
  });

  it('drops the errors as soon as a date changes', () => {
    renderPage();
    create();
    expect(dueAt()).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(dueAt(), { target: { value: '2026-12-08T08:00' } });
    expect(opensAt()).not.toHaveAttribute('aria-invalid');
    expect(dueAt()).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Chọn hạn nộp.')).toBeNull();
  });

  it('drops a date error from the server when the date changes', async () => {
    renderPage();
    fireEvent.change(opensAt(), { target: { value: '2026-12-01T08:00' } });
    fireEvent.change(dueAt(), { target: { value: '2026-12-08T08:00' } });
    request.mockRejectedValueOnce(
      new ApiProblemError({
        type: 'urn:leetkob:problem:invalid-request',
        title: 'Invalid request',
        status: 400,
        errors: [{ field: 'dueAt', detail: 'must be after opensAt' }],
      }),
    );
    create();
    await screen.findByRole('alert');
    expect(dueAt()).toHaveAccessibleDescription('Chọn hạn nộp sau thời điểm mở.');
    fireEvent.change(dueAt(), { target: { value: '2026-12-09T08:00' } });
    expect(dueAt()).not.toHaveAttribute('aria-invalid');
  });

  it('sends both dates with a time zone', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Lab' } });
    fireEvent.change(opensAt(), { target: { value: '2026-12-01T08:00' } });
    fireEvent.change(dueAt(), { target: { value: '2026-12-08T23:59' } });
    request.mockResolvedValueOnce({ title: 'Lab' });
    create();
    await screen.findByText('Lab list');
    const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string) as Record<string, string>;
    const withZone = /(Z|[+-]\d{2}:\d{2})$/;
    expect(body.opensAt).toMatch(withZone);
    expect(body.dueAt).toMatch(withZone);
    expect(Date.parse(body.opensAt ?? '')).toBe(new Date('2026-12-01T08:00').getTime());
  });
});

describe('dateErrors', () => {
  it('accepts Hạn nộp after Mở lúc', () => {
    expect(dateErrors('2026-12-01T08:00', '2026-12-01T08:01')).toEqual({});
  });

  it('treats an unparsable value as missing', () => {
    expect(toIso('not a date')).toBe('');
    expect(dateErrors('not a date', '')).toEqual({
      opensAt: 'Chọn thời điểm mở lab.',
      dueAt: 'Chọn hạn nộp.',
    });
  });
});
