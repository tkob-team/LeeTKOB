import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import { SubmitJudgePage } from './SubmitJudgePage';

const { request } = vi.hoisted(() => ({ request: vi.fn<ApiClient['request']>() }));

vi.mock('../../api/client', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../api/client')>();
  return { ...module, api: { request } };
});

const first = {
  id: '00000000-0000-4000-8000-00000000000a',
  title: 'First lab',
  latestSubmissionId: null,
};
const second = {
  id: '00000000-0000-4000-8000-00000000000b',
  title: 'Second lab',
  latestSubmissionId: null,
};

beforeEach(() => {
  request.mockReset();
  window.history.replaceState({}, '', '/student/submit?lab=00000000-0000-4000-8000-0000000000ff');
  request.mockResolvedValueOnce([first, second]);
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('submit: ?lab= names a lab that is not in the list', () => {
  it('warns "Không tìm thấy lab này." and leaves the lab choice empty', async () => {
    render(<SubmitJudgePage />);
    await screen.findByRole('option', { name: 'First lab' });
    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy lab này.');
    expect(screen.getByRole('combobox', { name: 'Lab' })).toHaveValue('');
    expect(screen.queryByText('Chưa nộp bài nào.')).toBeNull();
  });

  it('does not submit until a lab is chosen', async () => {
    render(<SubmitJudgePage />);
    await screen.findByRole('option', { name: 'First lab' });
    fireEvent.change(screen.getByLabelText('Mã nguồn C++17'), {
      target: { value: 'int main() {}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    expect(screen.getByRole('combobox', { name: 'Lab' })).toHaveAccessibleDescription(
      'Chọn một lab.',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('choosing a lab clears the warning and the empty option', async () => {
    render(<SubmitJudgePage />);
    await screen.findByRole('option', { name: 'First lab' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Lab' }), {
      target: { value: second.id },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Lab' })).toHaveValue(second.id);
    expect(screen.queryByRole('option', { name: 'Chọn lab' })).toBeNull();
  });
});
