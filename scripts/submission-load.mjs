#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

const SAMPLE_CODE = 'int main() { return 0; }\n';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usage =
  'node scripts/submission-load.mjs --url http://127.0.0.1:8080 --lab <uuid> ' +
  '[--count 1] [--concurrency 1] [--timeout-ms 5000]\n' +
  'Set LEETKOB_LOAD_TOKEN to a student JWT for a local test lab that is open.';

function positiveInteger(value, name, maximum) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > maximum) {
    throw new Error(`--${name} must be an integer from 1 to ${maximum}.`);
  }
  return Number(value);
}

async function submit(endpoint, labId, token, timeoutMs, seenIds) {
  const start = performance.now();
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({ code: SAMPLE_CODE }),
      redirect: 'error',
      signal,
    });
    if (response.status !== 201) {
      await response.body?.cancel();
      return { status: String(response.status), success: false };
    }
    const receipt = await response.json().catch(() => null);
    if (
      !receipt ||
      typeof receipt.id !== 'string' ||
      !UUID.test(receipt.id) ||
      seenIds.has(receipt.id.toLowerCase()) ||
      typeof receipt.labId !== 'string' ||
      receipt.labId.toLowerCase() !== labId ||
      receipt.status !== 'queued' ||
      receipt.sizeBytes !== Buffer.byteLength(SAMPLE_CODE)
    ) {
      return { status: signal.aborted ? 'timeout' : 'invalid-receipt', success: false };
    }
    seenIds.add(receipt.id.toLowerCase());
    return { status: '201', success: true, elapsedMs: performance.now() - start };
  } catch {
    return { status: signal.aborted ? 'timeout' : 'request-error', success: false };
  }
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return Number(sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(1));
}

async function main() {
  const { values } = parseArgs({
    options: {
      url: { type: 'string' },
      lab: { type: 'string' },
      count: { type: 'string', default: '1' },
      concurrency: { type: 'string', default: '1' },
      'timeout-ms': { type: 'string', default: '5000' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  const token = process.env.LEETKOB_LOAD_TOKEN?.trim();
  if (!values.lab || !UUID.test(values.lab) || !token || !values.url) {
    throw new Error(usage);
  }
  const base = new URL(values.url);
  const loopback = ['127.0.0.1', '[::1]', 'localhost'];
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    !loopback.includes(base.hostname) ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash
  ) {
    throw new Error('--url must be a loopback HTTP(S) origin without credentials or a path.');
  }
  const count = positiveInteger(values.count, 'count', 1000);
  const concurrency = positiveInteger(values.concurrency, 'concurrency', Math.min(count, 80));
  const timeout = positiveInteger(values['timeout-ms'], 'timeout-ms', 120_000);
  const labId = values.lab.toLowerCase();
  const endpoint = new URL(`/labs/${labId}/submissions`, base);
  const results = [];
  const seenIds = new Set();
  let next = 0;

  async function sendBatch() {
    while (next < count) {
      next += 1;
      results.push(await submit(endpoint, labId, token, timeout, seenIds));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, sendBatch));

  const elapsed = results
    .filter((result) => result.success)
    .map((result) => result.elapsedMs)
    .sort((a, b) => a - b);
  const statuses = {};
  for (const { status } of results) statuses[status] = (statuses[status] ?? 0) + 1;
  console.log(JSON.stringify({
    requested: count,
    concurrency,
    statuses,
    successful: elapsed.length,
    failed: count - elapsed.length,
    receiptP50Ms: percentile(elapsed, 0.5),
    receiptP95Ms: percentile(elapsed, 0.95),
  }, null, 2));
  if (elapsed.length !== count) process.exitCode = 1;
}

main().catch((error) => {
  // Node may include an invalid URL in an error object. Never echo user input or credentials.
  console.error(error.code === 'ERR_INVALID_URL' ? '--url is not a valid URL.' : error.message);
  process.exitCode = 2;
});
