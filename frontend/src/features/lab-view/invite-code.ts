/** Invite codes are 32 characters from the URL-safe Base64 alphabet (classes contract). */
export const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{32}$/;

/**
 * The message shown under "Mã mời" for a code that cannot be valid, or undefined for a code
 * worth sending. `code` is already trimmed.
 */
export function inviteCodeError(code: string): string | undefined {
  if (code.length === 0) return 'Nhập mã mời.';
  if (INVITE_CODE_PATTERN.test(code)) return undefined;
  return `Mã mời gồm đúng 32 ký tự (chữ, số, - và _). Bạn đã nhập ${String(code.length)} ký tự.`;
}
