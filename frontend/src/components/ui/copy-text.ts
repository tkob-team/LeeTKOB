/**
 * Copies text to the clipboard. `navigator.clipboard` exists only in secure contexts (HTTPS or
 * localhost); the deployment may run over plain HTTP, so fall back to a temporary textarea and
 * `execCommand('copy')`. Resolves to whether the copy succeeded.
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = (navigator as { clipboard?: Clipboard }).clipboard;
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or not focused: try the fallback below.
    }
  }
  return copyWithTextarea(text);
}

function copyWithTextarea(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.className = 'lk-sr-only';
  document.body.appendChild(area);
  area.select();
  try {
    // execCommand is the only clipboard API outside secure contexts; some environments lack it.
    const legacy = document as { execCommand?: (command: string) => boolean };
    return legacy.execCommand?.('copy') ?? false;
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
