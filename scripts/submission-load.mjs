#!/usr/bin/env node
import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline';
import { createHmac, randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

const SAMPLE_CODE = 'int main() { return 0; }\n';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usage =
  'node scripts/submission-load.mjs --url http://127.0.0.1:8080 --lab <uuid> ' +
  '[--count 1] [--concurrency 1] [--timeout-ms 5000]\n' +
  'Set LEETKOB_LOAD_TOKEN for local smoke or pass --pa5-load --receipt-manifest PATH ' +
  'with 80 JWTs on stdin or --seed-class CLASS_UUID.';

async function seededTokens(base, classId, secret) {
  if (!secret || secret.length < 32) throw new Error('Set a 32-character LOAD_SEED_SECRET.');
  const tokens = [];
  async function signIn(student) {
    const email = 'load-' + classId + '-' + student + '@leetkob.test';
    const password = createHmac('sha256', secret).update(email).digest('hex');
    const response = await fetch(new URL('/api/auth/login', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('A seeded student could not sign in.');
    const { token } = await response.json();
    return token;
  }
  for (let first = 1; first <= 80; first += 4) {
    tokens.push(...await Promise.all(Array.from({ length: 4 }, (_, i) => signIn(first + i))));
  }
  return tokens;
}

async function readLoadStudents(tokens) {
  const students = new Map();
  const lines = tokens ?? createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const token = line.trim();
    let claims;
    try {
      if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new Error();
      claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    } catch {
      throw new Error('Expected one valid student JWT per stdin line.');
    }
    if (!UUID.test(claims?.sub) || claims.role !== 'STUDENT' || !Number.isFinite(claims.exp)
        || claims.exp <= Date.now() / 1000 + 25) {
      throw new Error('All students need JWTs valid through the run.');
    }
    const id = claims.sub.toLowerCase();
    if (students.has(id) || students.size === 80) {
      throw new Error('Supply exactly 80 JWTs with distinct student IDs.');
    }
    students.set(id, token);
  }
  if (students.size !== 80) throw new Error('Supply exactly 80 JWTs with distinct student IDs.');
  return [...students.entries()];
}

function positiveInteger(value, name, maximum) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > maximum) {
    throw new Error(`--${name} must be an integer from 1 to ${maximum}.`);
  }
  return Number(value);
}

async function submit(endpoint, labId, token, timeoutMs, seenIds, studentId) {
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
      (studentId && (
        receipt.studentId?.toLowerCase() !== studentId ||
        !Number.isFinite(Date.parse(receipt.submittedAt))
      )) ||
      receipt.status !== 'queued' ||
      receipt.sizeBytes !== Buffer.byteLength(SAMPLE_CODE)
    ) {
      return { status: signal.aborted ? 'timeout' : 'invalid-receipt', success: false };
    }
    seenIds.add(receipt.id.toLowerCase());
    return {
      status: '201',
      success: true,
      elapsedMs: performance.now() - start,
      submittedAt: studentId ? Date.parse(receipt.submittedAt) : undefined,
      submissionId: receipt.id.toLowerCase(),
      studentId,
    };
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
      'pa5-load': { type: 'boolean' },
      'seed-class': { type: 'string' },
      'receipt-manifest': { type: 'string' },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  const token = process.env.LEETKOB_LOAD_TOKEN?.trim();
  const pa5 = values['pa5-load'];
  if (!values.lab || !UUID.test(values.lab) || (!pa5 && !token) || !values.url) {
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
  const endpoint = new URL(
    (pa5 ? '/api' : '') + '/labs/' + labId + '/submissions', base,
  );
  if (pa5) {
    if (values['seed-class'] && !UUID.test(values['seed-class'])) {
      throw new Error('--seed-class must be a UUID.');
    }
    const manifestPath = values['receipt-manifest'];
    if (!manifestPath) throw new Error('--pa5-load requires --receipt-manifest PATH.');
    const manifest = await open(manifestPath, 'wx', 0o600).catch(() => {
      throw new Error('Could not create the receipt manifest. Choose a new writable path.');
    });
    try {
      const tokens = values['seed-class']
        ? await seededTokens(base, values['seed-class'].toLowerCase(), process.env.LOAD_SEED_SECRET)
        : undefined;
      await runPa5(endpoint, labId, tokens, manifest);
    } finally {
      await manifest.close();
    }
    return;
  }
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

async function runPa5(endpoint, labId, tokens, manifest) {
  const students = await readLoadStudents(tokens);
  const seen = new Set();
  const start = performance.now();
  const wallStart = new Date().toISOString();
  const launched = [];
  const requests = students.map(async ([studentId, studentToken], index) => {
    const scheduled = Math.floor(index / 8) * 1000;
    if (scheduled > 0) await delay(Math.max(0, start + scheduled - performance.now()));
    const launchMs = performance.now() - start;
    launched.push(launchMs);
    if (launchMs >= 10_000) return { status: 'launch-deadline', success: false };
    return submit(endpoint, labId, studentToken, 10_000, seen, studentId);
  });
  const results = await Promise.all(requests);
  const successful = results.filter((result) => result.success);
  const elapsed = successful.map((result) => result.elapsedMs).sort((a, b) => a - b);
  const statuses = {};
  for (const { status } of results) statuses[status] = (statuses[status] ?? 0) + 1;
  const accepted = successful.map((result) => result.submittedAt);
  const arrivalSpan = accepted.length ? Math.max(...accepted) - Math.min(...accepted) : null;
  const passed = successful.length === 80 && Math.max(...launched) < 10_000 && arrivalSpan < 10_000;
  const p95 = percentile(elapsed, 0.95);
  await manifest.writeFile(JSON.stringify({
    version: 1,
    lab_id: labId,
    utc_start: wallStart,
    passed,
    receipts: successful.map((result) => ({
      submission_id: result.submissionId,
      student_id: result.studentId,
      submitted_at: new Date(result.submittedAt).toISOString(),
    })),
  }, null, 2) + '\n');
  console.log([
    '# T102 load run',
    '',
    '- UTC start ' + wallStart,
    '- Students 80',
    '- Accepted receipts ' + successful.length + '/80',
    '- Last request start ' + Math.max(...launched).toFixed(1) + ' ms after start',
    '- Server receipt timestamp span ' + (arrivalSpan === null ? 'unavailable' : arrivalSpan + ' ms'),
    '- Receipt p95 ' + (p95 === null ? 'unavailable' : p95.toFixed(1) + ' ms'),
    '- Outcomes ' + JSON.stringify(statuses),
    '- Result ' + (passed ? 'PASS' : 'FAIL'),
    '',
  ].join('\n'));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  // Node may include an invalid URL in an error object. Never echo user input or credentials.
  console.error(error.code === 'ERR_INVALID_URL' ? '--url is not a valid URL.' : error.message);
  process.exitCode = 2;
});
