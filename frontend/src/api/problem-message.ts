import { ApiProblemError } from './client';
import type { ProblemDetails, ProblemFieldError } from './problem';

/**
 * Vietnamese text for every problem the UI shows. Pages branch on `type` (and `status`), never on
 * the server's `title` or `detail`, which are English and may change (docs/contract/). The URN,
 * title and detail sent by the server are never shown.
 */
export const GENERIC_MESSAGE = 'Có lỗi xảy ra. Vui lòng thử lại.';

const PREFIX = 'urn:leetkob:problem:';

/** Problems built by the frontend itself (not by the server); their text is already Vietnamese. */
export const CLIENT_PREFIX = 'urn:leetkob:client:';

interface Message {
  title: string;
  detail?: string;
}

const BY_TYPE: Record<string, Message> = {
  'invalid-request': {
    title: 'Dữ liệu chưa hợp lệ',
    detail: 'Kiểm tra lại thông tin đã nhập hoặc đường dẫn rồi thử lại.',
  },
  unauthenticated: {
    title: 'Phiên đăng nhập đã hết hạn',
    detail: 'Vui lòng đăng nhập lại.',
  },
  'forbidden-role': {
    title: 'Bạn không có quyền thực hiện thao tác này',
    detail: 'Trang này dành cho vai trò khác.',
  },
  'class-not-found': {
    title: 'Không tìm thấy lớp',
    detail: 'Lớp không tồn tại hoặc bạn không phải TA của lớp này.',
  },
  'class-access-denied': {
    title: 'Bạn không có quyền thực hiện thao tác này',
    detail: 'Thao tác này dành cho vai trò khác.',
  },
  'member-has-submissions': {
    title: 'Sinh viên đã có bài nộp, chưa gỡ được',
    detail: 'Chỉ gỡ được sinh viên chưa nộp bài nào trong lớp.',
  },
  'lab-not-found': {
    title: 'Không tìm thấy lab',
    detail: 'Lab không tồn tại hoặc không thuộc lớp của bạn.',
  },
  'lab-not-open': { title: 'Lab chưa mở', detail: 'Đề bài và nộp bài mở khi tới giờ mở lab.' },
  'lab-closed': { title: 'Lab đã hết hạn nộp', detail: 'Không nhận bài nộp sau hạn.' },
  'code-too-large': {
    title: 'Mã nguồn quá lớn',
    detail: 'Mã nguồn tối đa 64 KB (65.536 byte UTF-8).',
  },
  'idempotency-key-required': { title: GENERIC_MESSAGE },
  'idempotency-key-reused': {
    title: 'Lần gửi này trùng với một lần gửi khác',
    detail: 'Tải lại trang rồi nộp lại.',
  },
  'invalid-credentials': {
    title: 'Sai email hoặc mật khẩu',
    detail: 'Kiểm tra lại email và mật khẩu rồi thử lại.',
  },
  'too-many-attempts': {
    title: 'Thử sai quá nhiều lần',
    detail: 'Tạm khoá đăng nhập. Đợi khoảng 15 phút rồi thử lại.',
  },
  'method-not-allowed': { title: GENERIC_MESSAGE },
  'unsupported-media-type': { title: GENERIC_MESSAGE },
  'internal-error': {
    title: 'Máy chủ đang gặp sự cố',
    detail: 'Thử lại sau ít phút.',
  },
};

/** Text for a problem that carries no known type (a proxy page, `about:blank`). */
function byStatus(status: number): Message {
  if (status >= 500) return { title: 'Máy chủ đang gặp sự cố', detail: 'Thử lại sau ít phút.' };
  return { title: GENERIC_MESSAGE };
}

/** Vietnamese title and detail for a problem. An unknown server type reads GENERIC_MESSAGE. */
export function problemMessage(problem: ProblemDetails): Message {
  // Built in the browser (network failure, own checks): already Vietnamese.
  if (problem.status === 0 || problem.type.startsWith(CLIENT_PREFIX)) {
    return problem.detail === undefined
      ? { title: problem.title }
      : { title: problem.title, detail: problem.detail };
  }
  if (problem.type.startsWith(PREFIX)) {
    return BY_TYPE[problem.type.slice(PREFIX.length)] ?? { title: GENERIC_MESSAGE };
  }
  if (problem.type === 'about:blank') return byStatus(problem.status);
  return { title: GENERIC_MESSAGE };
}

const FIELD_LABEL: Record<string, string> = {
  title: 'Tiêu đề',
  statementMd: 'Đề bài',
  opensAt: 'Mở lúc',
  dueAt: 'Hạn nộp',
  cpuTimeMs: 'Thời gian CPU',
  memoryMb: 'Bộ nhớ',
  tests: 'Test',
  constraints: 'Ràng buộc',
  input: 'Đầu vào',
  expectedOutput: 'Đầu ra mong đợi',
  code: 'Mã',
  text: 'Nội dung',
  deduction: 'Khoản trừ',
  email: 'Email',
  password: 'Mật khẩu',
  labId: 'Lab',
  name: 'Tên lớp',
  inviteCode: 'Mã mời',
  userId: 'Trợ giảng',
};

/** What a valid value looks like, per field name (the last part of a path like `tests[0].input`). */
const FIELD_RULE: Record<string, string> = {
  title: 'Nhập tiêu đề, tối đa 200 ký tự.',
  statementMd: 'Nhập đề bài, tối đa 65.536 ký tự.',
  opensAt: 'Chọn thời điểm mở lab.',
  dueAt: 'Chọn hạn nộp sau thời điểm mở.',
  cpuTimeMs: 'Thời gian CPU phải là số nguyên từ 1000 đến 5000 ms.',
  memoryMb: 'Bộ nhớ phải là số nguyên từ 64 đến 512 MB.',
  tests: 'Lab cần từ 1 đến 100 test.',
  constraints: 'Lab có tối đa 20 ràng buộc.',
  input: 'Đầu vào tối đa 1 MiB.',
  expectedOutput: 'Đầu ra mong đợi tối đa 1 MiB.',
  deduction: 'Khoản trừ phải lớn hơn 0, tối đa 10, nhiều nhất 2 chữ số thập phân.',
  text: 'Nhập nội dung ràng buộc, tối đa 2000 ký tự.',
  email: 'Nhập email hợp lệ.',
  password: 'Nhập mật khẩu (tối đa 72 byte).',
  labId: 'Chọn một lab.',
  name: 'Nhập tên lớp, tối đa 200 ký tự.',
  inviteCode: 'Mã mời gồm đúng 32 ký tự (chữ, số, - và _).',
  userId: 'Chọn một tài khoản trợ giảng.',
};

/** Rules for a field name that also exists outside its form (`code` is a constraint code or C++). */
const PATH_RULE: Record<string, string> = {
  code: 'Nhập mã nguồn C++17 (tối đa 64 KB).',
  'constraints.code': 'Mã có dạng C1 đến C99, không trùng nhau.',
};

function fieldName(path: string): { name: string; parent: string } {
  const parts = path.replace(/\[\d+\]/g, '').split('.');
  return { name: parts[parts.length - 1] ?? path, parent: parts.slice(0, -1).join('.') };
}

/** Vietnamese message for one field error, by field name; the server's detail is never used. */
export function fieldErrorMessage(field: string): string {
  const { name, parent } = fieldName(field);
  const scoped = parent ? PATH_RULE[`${parent}.${name}`] : undefined;
  const rule = scoped ?? (parent ? undefined : PATH_RULE[name]) ?? FIELD_RULE[name];
  if (rule) return rule;
  const label = FIELD_LABEL[name];
  return label ? `${label} chưa hợp lệ.` : 'Giá trị chưa hợp lệ.';
}

/** The problem with Vietnamese title, detail and field errors; `type` and `status` stay as sent. */
export function localizeProblem(problem: ProblemDetails): ProblemDetails {
  const message = problemMessage(problem);
  const localized: ProblemDetails = { type: problem.type, status: problem.status, ...message };
  if (problem.instance !== undefined) localized.instance = problem.instance;
  if (problem.errors) {
    localized.errors = problem.errors.map((error): ProblemFieldError => ({
      field: error.field,
      detail: problem.type.startsWith(CLIENT_PREFIX)
        ? error.detail
        : fieldErrorMessage(error.field),
    }));
  }
  return localized;
}

/** Field errors of a problem as `{ path: Vietnamese message }`. */
export function localizedFieldErrors(problem: ProblemDetails | undefined): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!problem) return errors;
  for (const error of localizeProblem(problem).errors ?? []) errors[error.field] = error.detail;
  return errors;
}

/** Any error caught around `api.request`, as a Vietnamese problem ready for ProblemAlert. */
export function problemFrom(cause: unknown): ProblemDetails {
  if (cause instanceof ApiProblemError) return localizeProblem(cause.problem);
  return {
    type: `${CLIENT_PREFIX}unreadable-response`,
    title: 'Không đọc được phản hồi của máy chủ',
    status: 0,
  };
}
