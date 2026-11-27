import { describe, expect, it } from 'vitest';
import { ApiProblemError } from './client';
import type { ProblemDetails } from './problem';
import {
  fieldErrorMessage,
  GENERIC_MESSAGE,
  localizeProblem,
  problemFrom,
  problemMessage,
} from './problem-message';

function server(type: string, status: number, extra: Partial<ProblemDetails> = {}): ProblemDetails {
  return {
    type: `urn:leetkob:problem:${type}`,
    title: 'English title from the server',
    status,
    detail: 'English detail from the server.',
    instance: '/labs/1',
    ...extra,
  };
}

/** Everything a page could print for the problem. */
function shown(problem: ProblemDetails): string {
  const localized = localizeProblem(problem);
  return [
    localized.title,
    localized.detail ?? '',
    ...(localized.errors ?? []).map((error) => error.detail),
  ].join('\n');
}

describe('problemMessage', () => {
  it.each([
    ['invalid-request', 400, 'Dữ liệu chưa hợp lệ'],
    ['lab-not-found', 404, 'Không tìm thấy lab'],
    ['class-not-found', 404, 'Không tìm thấy lớp'],
    ['lab-not-open', 409, 'Lab chưa mở'],
    ['lab-closed', 409, 'Lab đã hết hạn nộp'],
    ['unauthenticated', 401, 'Phiên đăng nhập đã hết hạn'],
    ['forbidden-role', 403, 'Bạn không có quyền thực hiện thao tác này'],
    ['internal-error', 500, 'Máy chủ đang gặp sự cố'],
    ['invalid-credentials', 401, 'Sai email hoặc mật khẩu'],
    ['too-many-attempts', 429, 'Thử sai quá nhiều lần'],
  ])('%s (%i) reads "%s" and never the server text or URN', (type, status, title) => {
    const problem = server(type, status);
    expect(problemMessage(problem).title).toBe(title);
    const text = shown(problem);
    expect(text).not.toContain('English');
    expect(text).not.toContain('urn:');
  });

  it('an unknown server type reads the generic message', () => {
    expect(problemMessage(server('quota-exceeded', 409))).toEqual({ title: GENERIC_MESSAGE });
    expect(problemMessage({ type: 'https://example.test/x', title: 'X', status: 400 })).toEqual({
      title: GENERIC_MESSAGE,
    });
    expect(GENERIC_MESSAGE).toBe('Có lỗi xảy ra. Vui lòng thử lại.');
  });

  it('a body that is not a problem (proxy page) goes by status, never by statusText', () => {
    expect(problemMessage({ type: 'about:blank', title: 'Bad Gateway', status: 502 }).title).toBe(
      'Máy chủ đang gặp sự cố',
    );
    expect(problemMessage({ type: 'about:blank', title: 'Not Found', status: 404 })).toEqual({
      title: GENERIC_MESSAGE,
    });
  });

  it('keeps the text of problems built in the browser (network failure)', () => {
    expect(
      problemMessage({
        type: 'about:blank',
        title: 'Không kết nối được máy chủ',
        status: 0,
        detail: 'Kiểm tra kết nối mạng rồi thử lại.',
      }),
    ).toEqual({
      title: 'Không kết nối được máy chủ',
      detail: 'Kiểm tra kết nối mạng rồi thử lại.',
    });
  });
});

describe('field errors', () => {
  it('follow the field name, not the server detail', () => {
    const problem = server('invalid-request', 400, {
      errors: [
        { field: 'dueAt', detail: 'must be after opensAt' },
        { field: 'constraints[1].code', detail: 'Duplicate code C1.' },
        { field: 'tests[0].input', detail: 'too large' },
        { field: 'cpuTimeMs', detail: 'must be between 1000 and 5000' },
        { field: 'code', detail: 'must not be blank' },
        { field: 'somethingNew', detail: 'bad' },
      ],
    });
    expect(localizeProblem(problem).errors).toEqual([
      { field: 'dueAt', detail: 'Chọn hạn nộp sau thời điểm mở.' },
      { field: 'constraints[1].code', detail: 'Mã có dạng C1 đến C99, không trùng nhau.' },
      { field: 'tests[0].input', detail: 'Đầu vào tối đa 1 MiB.' },
      { field: 'cpuTimeMs', detail: 'Thời gian CPU phải là số nguyên từ 1000 đến 5000 ms.' },
      { field: 'code', detail: 'Nhập mã nguồn C++17 (tối đa 64 KB).' },
      { field: 'somethingNew', detail: 'Giá trị chưa hợp lệ.' },
    ]);
  });

  it('name a known field without a rule by its Vietnamese label', () => {
    expect(fieldErrorMessage('constraints[0].unknown')).toBe('Giá trị chưa hợp lệ.');
    expect(fieldErrorMessage('constraints')).toBe('Lab có tối đa 20 ràng buộc.');
  });
});

describe('problemFrom', () => {
  it('localizes an ApiProblemError and keeps type and status', () => {
    const problem = problemFrom(new ApiProblemError(server('lab-not-found', 404)));
    expect(problem).toMatchObject({
      type: 'urn:leetkob:problem:lab-not-found',
      status: 404,
      title: 'Không tìm thấy lab',
    });
  });

  it('turns any other error into a Vietnamese problem', () => {
    expect(problemFrom(new SyntaxError('Unexpected token <')).title).toBe(
      'Không đọc được phản hồi của máy chủ',
    );
  });
});
