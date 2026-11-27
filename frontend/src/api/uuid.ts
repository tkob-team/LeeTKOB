/**
 * Random UUID v4 from `crypto.getRandomValues`.
 *
 * `crypto.randomUUID` exists only in secure contexts (HTTPS or localhost); on a plain HTTP
 * deployment it is undefined, while `getRandomValues` is available everywhere.
 */
export function uuidV4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 9562 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
