import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '../../components/ui';
import { CreateLabPage } from './CreateLabPage';
import { formatNames, planTests } from './lab-merge';

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

function chooseFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText('Chọn file đề, ràng buộc và test'), {
    target: { files },
  });
}

function chooseFolder(files: File[]) {
  fireEvent.change(screen.getByLabelText('Chọn thư mục bài'), { target: { files } });
}

/** A File as `<input webkitdirectory>` gives it, with its path inside the picked folder. */
function inFolder(path: string, content: string): File {
  const file = new File([content], path.split('/').pop() ?? path);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

/** Test pairs `NN.in`/`NN.out` for the given numbers; `tag` makes the content differ. */
function pairs(numbers: number[], tag: string): File[] {
  return numbers.flatMap((n) => {
    const stem = String(n).padStart(2, '0');
    return [
      new File([`${tag} in ${stem}\n`], `${stem}.in`),
      new File([`${tag} out ${stem}\n`], `${stem}.out`),
    ];
  });
}

const statement = (body: string) => new File([`# Sorting\n\n${body}\n`], 'statement.md');
const constraintsFile = (deduction: number) =>
  new File(
    [
      JSON.stringify([
        { id: 'C1', text: 'No library sort.', deduction },
        { id: 'C2', text: 'Own merge sort.', deduction: 4 },
      ]),
    ],
    'constraints.json',
  );

const testCount = (n: number) => screen.getByRole('heading', { name: `Test (${String(n)})` });

async function dialogNamed(name: string) {
  return screen.findByRole('dialog', { name });
}

describe('incremental import from files', () => {
  it('adds new test numbers without asking: 01, then 02, total 2', async () => {
    renderPage();
    chooseFiles(pairs([1], 'a'));
    expect(await screen.findByText('Đã thêm 1 test (01), tổng 1 test.')).toBeInTheDocument();
    chooseFiles(pairs([2], 'a'));
    expect(await screen.findByText('Đã thêm 1 test (02), tổng 2 test.')).toBeInTheDocument();
    expect(testCount(2)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Đầu vào 1')).toHaveValue('a in 01\n');
    expect(screen.getByLabelText('Đầu vào 2')).toHaveValue('a in 02\n');
  });

  it('does not ask and changes nothing when the same files are imported again', async () => {
    renderPage();
    const files = [statement('Read n.'), constraintsFile(3), ...pairs([1, 2], 'a')];
    chooseFiles(files);
    await screen.findByText(
      'Đã nhập từ file: đề bài và tiêu đề, 2 ràng buộc. Đã thêm 2 test (01, 02), tổng 2 test.',
    );
    chooseFiles(files);
    expect(await screen.findByText('Không có gì thay đổi.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(testCount(2)).toBeInTheDocument();
  });

  async function withSevenThenFiveOther() {
    renderPage();
    chooseFiles(pairs([1, 2, 3, 4, 5, 6, 7], 'a'));
    await screen.findByText('Đã thêm 7 test (01–07), tổng 7 test.');
    chooseFiles(pairs([1, 2, 3, 4, 5], 'b'));
    return dialogNamed('Ghi đè test trùng số?');
  }

  it('asks before overwriting 01–05 of another problem and can keep 06–07', async () => {
    const dialog = await withSevenThenFiveOther();
    expect(dialog).toHaveTextContent(
      '5 test trùng số (01–05) sẽ bị ghi đè; 2 test cũ (06, 07) vẫn giữ.',
    );
    expect(Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      'Huỷ',
      'Thay toàn bộ bằng 5 test mới',
      'Ghi đè 01–05, giữ 06–07',
    ]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ghi đè 01–05, giữ 06–07' }));
    expect(await screen.findByText('Đã ghi đè 5 test (01–05), tổng 7 test.')).toBeInTheDocument();
    expect(testCount(7)).toBeInTheDocument();
    expect(screen.getByLabelText('Đầu vào 1')).toHaveValue('b in 01\n');
    expect(screen.getByLabelText('Đầu vào 6')).toHaveValue('a in 06\n');
  });

  it('replaces every test with the 5 new ones on the second button', async () => {
    const dialog = await withSevenThenFiveOther();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thay toàn bộ bằng 5 test mới' }));
    expect(await screen.findByText('Đã thay toàn bộ bằng 5 test mới.')).toBeInTheDocument();
    expect(testCount(5)).toBeInTheDocument();
    expect(screen.getByLabelText('Đầu vào 5')).toHaveValue('b in 05\n');
    expect(screen.queryByLabelText('Đầu vào 6')).toBeNull();
  });

  it('imports no test on "Huỷ" and keeps all 7', async () => {
    const dialog = await withSevenThenFiveOther();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
    expect(await screen.findByText('Không có gì thay đổi.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(testCount(7)).toBeInTheDocument();
    expect(screen.getByLabelText('Đầu vào 1')).toHaveValue('a in 01\n');
  });

  it('asks before replacing a different statement, and keeps it on "Huỷ"', async () => {
    renderPage();
    chooseFiles([statement('First.')]);
    await screen.findByText('Đã nhập từ file: đề bài và tiêu đề.');
    chooseFiles([statement('Second.')]);
    const dialog = await dialogNamed('Thay đề bài đang có?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ' }));
    expect(await screen.findByText('Không có gì thay đổi.')).toBeInTheDocument();
    expect(screen.getByLabelText('Đề bài (Markdown)')).toHaveValue('# Sorting\n\nFirst.\n');

    chooseFiles([statement('Second.')]);
    fireEvent.click(
      within(await dialogNamed('Thay đề bài đang có?')).getByRole('button', {
        name: 'Thay đề bài',
      }),
    );
    await screen.findAllByText('Đã nhập từ file: đề bài và tiêu đề.');
    expect(screen.getByLabelText('Đề bài (Markdown)')).toHaveValue('# Sorting\n\nSecond.\n');
  });

  it('asks before replacing 2 different constraints', async () => {
    renderPage();
    chooseFiles([constraintsFile(3)]);
    await screen.findByText('Đã nhập từ file: 2 ràng buộc.');
    chooseFiles([constraintsFile(3)]);
    expect(await screen.findByText('Không có gì thay đổi.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();

    chooseFiles([constraintsFile(5)]);
    const dialog = await dialogNamed('Thay 2 ràng buộc đang có?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thay ràng buộc' }));
    await screen.findAllByText('Đã nhập từ file: 2 ràng buộc.');
    expect(screen.getAllByLabelText('Khoản trừ')[0]).toHaveValue('5');
  });

  it('lists an unpaired test in "Cần xem lại" and deletes a single test', async () => {
    renderPage();
    chooseFiles([...pairs([1, 2], 'a'), new File(['x'], '03.in')]);
    await screen.findByText('Đã thêm 2 test (01, 02), tổng 2 test.');
    const panel = screen.getByRole('region', { name: 'Cần xem lại sau khi nhập file' });
    expect(panel).toHaveTextContent('Test 03: thiếu file 03.out, đã bỏ qua.');

    fireEvent.click(screen.getByRole('button', { name: 'Xoá test 1' }));
    expect(testCount(1)).toBeInTheDocument();
    expect(screen.getByLabelText('Đầu vào 1')).toHaveValue('a in 02\n');
  });

  it('explains partial import under the two import buttons', () => {
    renderPage();
    expect(
      screen.getByText(
        'Có thể nhập từng phần. Test trùng số sẽ được hỏi trước khi ghi đè. Nên nhập cả thư mục bài để tránh lẫn test của bài khác.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nhập thư mục' })).toBeInTheDocument();
    expect(screen.getByLabelText('Chọn thư mục bài')).toHaveAttribute('webkitdirectory');
  });
});

describe('folder import', () => {
  /** The 16 files of eval/dev/problems/sort-merge, as a picked folder gives them. */
  function sortMergeFolder(): File[] {
    // Vitest runs from frontend/; eval/ sits next to it.
    const root = join(process.cwd(), '../eval/dev/problems/sort-merge');
    const paths = [
      'statement.md',
      'constraints.json',
      ...readdirSync(join(root, 'tests')).map((name) => `tests/${name}`),
    ];
    return paths.map((path) =>
      inFolder(`sort-merge/${path}`, readFileSync(join(root, path), 'utf8')),
    );
  }

  it('fills an empty form from all 16 files without asking', async () => {
    renderPage();
    const files = sortMergeFolder();
    expect(files).toHaveLength(16);
    chooseFolder(files);
    expect(
      await screen.findByText('Đã nhập thư mục sort-merge: đề bài, 2 ràng buộc, 7 test.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Sorting with merge sort');
    expect(screen.getByRole('heading', { name: 'Ràng buộc (2)' })).toBeInTheDocument();
    expect(testCount(7)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cần xem lại sau khi nhập file' })).toBeNull();
  });

  it('asks before replacing a form that has content, and keeps it on "Huỷ"', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Bài cũ' } });
    chooseFolder(sortMergeFolder());
    const name = 'Thay toàn bộ đề, ràng buộc và test bằng nội dung thư mục sort-merge?';
    fireEvent.click(within(await dialogNamed(name)).getByRole('button', { name: 'Huỷ' }));
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Bài cũ');
    expect(testCount(1)).toBeInTheDocument();

    chooseFolder(sortMergeFolder());
    fireEvent.click(
      within(await dialogNamed(name)).getByRole('button', {
        name: 'Thay bằng thư mục sort-merge',
      }),
    );
    await screen.findByText('Đã nhập thư mục sort-merge: đề bài, 2 ràng buộc, 7 test.');
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Sorting with merge sort');
    expect(testCount(7)).toBeInTheDocument();
  });

  it('puts files outside the layout in "Cần xem lại"', async () => {
    renderPage();
    chooseFolder([
      inFolder('p/statement.md', '# P\n'),
      inFolder('p/tests/01.in', '1\n'),
      inFolder('p/tests/01.out', '1\n'),
      inFolder('p/notes.txt', 'x'),
      inFolder('p/01.in', 'stray'),
    ]);
    await screen.findByText('Đã nhập thư mục p: đề bài, 0 ràng buộc, 1 test.');
    const panel = screen.getByRole('region', { name: 'Cần xem lại sau khi nhập file' });
    expect(panel).toHaveTextContent('Bỏ qua notes.txt');
    expect(panel).toHaveTextContent('Bỏ qua 01.in');
    expect(panel).toHaveTextContent('Thư mục p không có constraints.json.');
  });
});

describe('lab-merge helpers', () => {
  it('writes runs of three or more as a range', () => {
    expect(formatNames(['03', '01', '02', '04', '05'])).toBe('01–05');
    expect(formatNames(['06', '07'])).toBe('06, 07');
    expect(formatNames(['06', '07'], 2)).toBe('06–07');
    expect(formatNames(['01', '03', '04', '05', 'x'])).toBe('01, 03–05, x');
  });

  it('ignores the blank starting test when planning', () => {
    const blank = { name: '01', input: '', expectedOutput: '' };
    const incoming = [{ name: '01', input: 'i', expectedOutput: 'o' }];
    expect(planTests([blank], incoming)).toEqual({
      added: incoming,
      conflicts: [],
      same: [],
      kept: [],
    });
  });
});
