import type { JudgeCode } from '../../components/ui';

export interface VerdictReport {
  status: 'queued' | 'grading' | 'completed';
  counted: boolean;
  verdict: JudgeCode | null;
  tests: { number: number; verdict: JudgeCode }[];
}

/** Reads the server's status events until the callback receives a final snapshot. */
export async function readVerdictEvents(
  response: Response,
  onStatus: (status: VerdictReport) => boolean,
): Promise<boolean> {
  if (!response.body || !response.headers.get('Content-Type')?.startsWith('text/event-stream')) {
    await response.body?.cancel();
    return false;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return false;
      buffer += decoder.decode(value, { stream: true });
      let end = /\r?\n\r?\n/.exec(buffer);
      if (!end && buffer.length > 1024 * 1024) throw new Error('Invalid status event size.');
      while (end) {
        const lines = buffer.slice(0, end.index).split(/\r?\n/);
        buffer = buffer.slice(end.index + end[0].length);
        const data = lines.find((line) => line.startsWith('data:'));
        if (
          lines.some((line) => /^event: ?status$/.test(line)) &&
          data &&
          onStatus(JSON.parse(data.slice(5)) as VerdictReport)
        ) {
          return true;
        }
        end = /\r?\n\r?\n/.exec(buffer);
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
