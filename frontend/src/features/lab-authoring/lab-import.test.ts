// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importLabFiles, parseConstraints, titleOf, type ImportFile } from './lab-import';

function file(name: string, content: string, webkitRelativePath = ''): ImportFile {
  return { name, webkitRelativePath, text: () => Promise.resolve(content) };
}

const constraintsJson = JSON.stringify([
  { id: 'C1', text: 'Do not call a library sort function.', deduction: 3 },
  { id: 'C2', text: 'Sort with a merge sort you wrote yourself.', deduction: 4.5 },
]);

describe('importLabFiles', () => {
  it('reads the eval layout and pairs tests in numeric order', async () => {
    const result = await importLabFiles([
      file('10.out', 'o10'),
      file('statement.md', '# Sorting with merge sort\n\nRead `n` integers.\n'),
      file('02.in', 'i2'),
      file('constraints.json', constraintsJson),
      file('10.in', 'i10'),
      file('02.out', 'o2'),
      file('01.in', 'i1', 'sort-merge/tests/01.in'),
      file('01.out', 'o1', 'sort-merge/tests/01.out'),
    ]);
    expect(result.title).toBe('Sorting with merge sort');
    expect(result.statementMd).toBe('# Sorting with merge sort\n\nRead `n` integers.\n');
    expect(result.constraints).toEqual([
      { code: 'C1', text: 'Do not call a library sort function.', deduction: '3' },
      { code: 'C2', text: 'Sort with a merge sort you wrote yourself.', deduction: '4.5' },
    ]);
    expect(result.tests).toEqual([
      { input: 'i1', expectedOutput: 'o1' },
      { input: 'i2', expectedOutput: 'o2' },
      { input: 'i10', expectedOutput: 'o10' },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.notes).toContain('tests: 3 cặp input/output.');
  });

  it('warns about unpaired tests, unknown files and a broken constraints.json', async () => {
    const result = await importLabFiles([
      file('01.in', 'a'),
      file('02.out', 'b'),
      file('notes.txt', 'x'),
      file('constraints.json', '{"id": "C1"}'),
    ]);
    expect(result.tests).toBeUndefined();
    expect(result.constraints).toBeUndefined();
    expect(result.warnings).toEqual([
      'Bỏ qua 1 file: notes.txt (không phải đề, ràng buộc hay test).',
      'constraints.json: constraints.json phải là một mảng.',
      'Test 01: thiếu file 01.out, đã bỏ qua.',
      'Test 02: thiếu file 02.in, đã bỏ qua.',
    ]);
  });
});

describe('the sort-merge problem from eval/dev', () => {
  it('imports statement, both constraints and all seven test pairs', async () => {
    const root = new URL('../../../../eval/dev/problems/sort-merge/', import.meta.url);
    const names = [
      'statement.md',
      'constraints.json',
      ...readdirSync(new URL('tests/', root)).map((name) => `tests/${name}`),
    ];
    const files = names.map((path) => ({
      name: path.split('/').pop() ?? path,
      webkitRelativePath: `sort-merge/${path}`,
      text: () => Promise.resolve(readFileSync(new URL(path, root), 'utf8')),
    }));

    const result = await importLabFiles(files);
    expect(result.warnings).toEqual([]);
    expect(result.title).toBe('Sorting with merge sort');
    expect(result.constraints?.map((c) => [c.code, c.deduction])).toEqual([
      ['C1', '3'],
      ['C2', '4'],
    ]);
    expect(result.tests).toHaveLength(7);
    expect(result.tests?.[0]?.input).toBe(readFileSync(new URL('tests/01.in', root), 'utf8'));
    expect(result.tests?.[6]?.expectedOutput).toBe(
      readFileSync(new URL('tests/07.out', root), 'utf8'),
    );
  });
});

describe('helpers', () => {
  it('takes the first level-one heading as the title', () => {
    expect(titleOf('Intro\n# Binary search #\n## Input')).toBe('Binary search');
    expect(titleOf('## Only a subheading')).toBeUndefined();
  });

  it('accepts code or id and rejects a constraint without a numeric deduction', () => {
    expect(parseConstraints('[{"code": "C3", "text": "t", "deduction": 1}]')).toEqual([
      { code: 'C3', text: 't', deduction: '1' },
    ]);
    expect(() => parseConstraints('[{"id": "C1", "text": "t", "deduction": "3"}]')).toThrow(
      'Ràng buộc thứ 1 cần id, text và deduction (số).',
    );
  });
});
