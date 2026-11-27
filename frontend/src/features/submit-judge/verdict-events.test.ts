import { describe, expect, it } from 'vitest';
import { readVerdictEvents } from './verdict-events';

describe('submission status event stream', () => {
  it('reports the initial and terminal snapshots across split chunks', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const chunk of [
          'event:status\ndata:{"status":"queued"}\n\n:keepalive\n\nevent:st',
          'atus\ndata:{"status":"completed"}\n\n',
        ]) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    const response = new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    const statuses: string[] = [];
    const complete = await readVerdictEvents(response, (event) => {
      statuses.push(event.status);
      return event.status === 'completed';
    });
    expect(complete).toBe(true);
    expect(statuses).toEqual(['queued', 'completed']);
  });
});
