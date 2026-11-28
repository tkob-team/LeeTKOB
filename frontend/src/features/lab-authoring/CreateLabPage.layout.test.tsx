import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '../../components/ui';
import { CreateLabPage } from './CreateLabPage';
import { importLabFiles, importLabFolder, type ImportFile } from './lab-import';

const classId = '1b2c3d4e-0000-4000-8000-000000000001';

function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/ta/classes/:classId/labs/new', element: <CreateLabPage /> }],
    { initialEntries: [`/ta/classes/${classId}/labs/new`] },
  );
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
}

/** A File as `<input webkitdirectory>` gives it, with its path inside the picked folder. */
function inFolder(path: string, content: string): File {
  const file = new File([content], path.split('/').pop() ?? path);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

function chooseFolder(files: File[]) {
  fireEvent.change(screen.getByLabelText('Chọn thư mục bài'), { target: { files } });
}

function chooseFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText('Chọn file đề, ràng buộc và test'), {
    target: { files },
  });
}

// Vitest runs from frontend/; eval/ sits next to it.
const ROOT = join(process.cwd(), '../eval/dev/problems/sort-merge');
const TEST_NAMES = readdirSync(join(ROOT, 'tests'));

/** sort-merge with its tests moved to `testsDir` ('' = next to statement.md). */
function sortMerge(folder: string, testsDir: string): File[] {
  const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
  return [
    inFolder(`${folder}/statement.md`, read('statement.md')),
    inFolder(`${folder}/constraints.json`, read('constraints.json')),
    ...TEST_NAMES.map((name) =>
      inFolder(`${folder}/${testsDir ? `${testsDir}/` : ''}${name}`, read(`tests/${name}`)),
    ),
  ];
}

const regionReview = () => screen.getByRole('region', { name: 'Cần xem lại sau khi nhập file' });
const testCount = (n: number) => screen.getByRole('heading', { name: `Test (${String(n)})` });

async function warningToast(message: string) {
  const text = await screen.findByText(message);
  expect(text.closest('.lk-toast')).toHaveClass('lk-toast--warning');
  expect(text).toHaveTextContent(`Lưu ý: ${message}`);
  return text;
}

describe('folder import layouts', () => {
  it('reads a flat folder: statement, constraints and all 7 tests side by side', async () => {
    renderPage();
    chooseFolder(sortMerge('sort-merge', ''));
    expect(
      await screen.findByText('Đã nhập thư mục sort-merge: đề bài, 2 ràng buộc, 7 test.'),
    ).toBeInTheDocument();
    expect(testCount(7)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cần xem lại sau khi nhập file' })).toBeNull();
  });

  it('reads tests in tests/ and in a deeper subfolder alike', async () => {
    const inTests = await importLabFolder(sortMerge('a', 'tests'));
    const deep = await importLabFolder(sortMerge('b', 'data/cases/hidden'));
    for (const result of [inTests, deep]) {
      expect(result.testNames).toEqual(['01', '02', '03', '04', '05', '06', '07']);
      expect(result.warnings).toEqual([]);
    }
  });

  it('does not choose a test number found in two places and names both paths', async () => {
    renderPage();
    chooseFolder([
      ...sortMerge('p', ''),
      inFolder('p/tests/03.in', 'other'),
      inFolder('p/tests/03.out', 'other'),
    ]);
    await screen.findByText('Đã nhập thư mục p: đề bài, 2 ràng buộc, 6 test.');
    expect(regionReview()).toHaveTextContent(
      'Test 03: 03.in có ở 2 nơi (03.in, tests/03.in), chưa nhập test này.',
    );
    expect(screen.queryByLabelText('Đầu vào 7')).toBeNull();
  });

  it('keeps the statement when the folder has two .md files and none is statement.md', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Đề bài (Markdown)'), { target: { value: 'Đề cũ' } });
    chooseFolder([
      inFolder('q/a.md', '# A\n'),
      inFolder('q/b.md', '# B\n'),
      inFolder('q/01.in', '1\n'),
      inFolder('q/01.out', '1\n'),
    ]);
    await screen.findByText('Đã nhập thư mục q: 1 test.');
    expect(regionReview()).toHaveTextContent(
      'Có 2 file .md (a.md, b.md), không biết file nào là đề; chưa nhập đề.',
    );
    expect(screen.getByLabelText('Đề bài (Markdown)')).toHaveValue('Đề cũ');
    await warningToast('Thư mục q không có file đề .md; đề bài hiện có được giữ nguyên.');
  });

  it('replaces only the tests from a folder that has only tests, and asks only about tests', async () => {
    renderPage();
    chooseFolder(sortMerge('sort-merge', 'tests'));
    await screen.findByText('Đã nhập thư mục sort-merge: đề bài, 2 ràng buộc, 7 test.');
    chooseFolder([inFolder('only/01.in', 'x\n'), inFolder('only/01.out', 'y\n')]);

    const dialog = await screen.findByRole('dialog', {
      name: 'Thay toàn bộ test bằng nội dung thư mục only?',
    });
    expect(dialog).toHaveTextContent(
      'Mọi test trên form sẽ được thay. Đề bài và ràng buộc giữ nguyên vì thư mục không có.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thay bằng thư mục only' }));
    await screen.findByText('Đã nhập thư mục only: 1 test.');
    expect(testCount(1)).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Sorting with merge sort');
    expect(screen.getByRole('heading', { name: 'Ràng buộc (2)' })).toBeInTheDocument();
    await warningToast(
      'Thư mục only không có file ràng buộc .json; ràng buộc hiện có được giữ nguyên.',
    );
  });

  it('never replaces 7 tests with none: keeps them and warns', async () => {
    renderPage();
    chooseFolder(sortMerge('sort-merge', 'tests'));
    await screen.findByText('Đã nhập thư mục sort-merge: đề bài, 2 ràng buộc, 7 test.');
    chooseFolder([inFolder('notests/statement.md', '# Mới\n\nĐề mới.\n')]);
    const dialog = await screen.findByRole('dialog', {
      name: 'Thay toàn bộ đề bằng nội dung thư mục notests?',
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thay bằng thư mục notests' }));
    await screen.findByText('Đã nhập thư mục notests: đề bài.');
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Mới');
    expect(testCount(7)).toBeInTheDocument();
    await warningToast('Thư mục notests không có file test nào; test hiện có được giữ nguyên.');
  });

  it('puts every skipped file in one line with its reason', async () => {
    const result = await importLabFolder([
      inFolder('r/statement.md', '# R\n'),
      inFolder('r/a.txt', 'x'),
      inFolder('r/b.png', 'x'),
      inFolder('r/src/c.cpp', 'x'),
    ]);
    expect(result.warnings).toEqual([
      'Bỏ qua 3 file: a.txt, b.png, src/c.cpp (không phải đề, ràng buộc hay test).',
    ]);
  });
});

describe('statement and constraints by extension (files too)', () => {
  const file = (name: string, content: string): ImportFile => ({
    name,
    text: () => Promise.resolve(content),
  });

  it('takes the only .md and the only .json when the usual names are missing', async () => {
    const result = await importLabFiles([
      file('de-bai.md', '# Đề\n'),
      file('rang-buoc.json', '[{"id":"C1","text":"t","deduction":1}]'),
    ]);
    expect(result.title).toBe('Đề');
    expect(result.constraints).toEqual([{ code: 'C1', text: 't', deduction: '1' }]);
    expect(result.warnings).toEqual([]);
  });

  it('prefers statement.md over another .md, which is then skipped', async () => {
    const result = await importLabFiles([
      file('statement.md', '# Đúng\n'),
      file('README.md', '# Không\n'),
    ]);
    expect(result.title).toBe('Đúng');
    expect(result.warnings).toEqual([
      'Bỏ qua 1 file: README.md (không phải đề, ràng buộc hay test).',
    ]);
  });

  it('reports two .json files and reads neither, from the file picker too', async () => {
    renderPage();
    chooseFiles([new File(['[]'], 'a.json'), new File(['[]'], 'b.json')]);
    expect(
      await screen.findByRole('region', { name: 'Cần xem lại sau khi nhập file' }),
    ).toHaveTextContent(
      'Có 2 file .json (a.json, b.json), không biết file nào là ràng buộc; chưa nhập ràng buộc.',
    );
  });

  it('says which folder layouts work, next to "Nhập thư mục"', () => {
    renderPage();
    expect(
      screen.getByText(
        'Thư mục cần có 1 file đề .md, 1 file ràng buộc .json và các file test NN.in/NN.out (ở gốc hay trong tests/ đều được).',
      ),
    ).toBeInTheDocument();
  });
});
