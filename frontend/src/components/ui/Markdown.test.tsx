import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Markdown, MarkdownInline } from './Markdown';

const statement = [
  '# Sorting with merge sort',
  '',
  'Read `n` integers.',
  '',
  '## Input',
  '- Line 1: `n`.',
  '- Line 2: the integers.',
  '',
  '| n | time |',
  '| - | ---- |',
  '| 5000 | 1 s |',
  '',
  '```',
  '6',
  '5 -2 9 -2 0 7',
  '```',
].join('\n');

function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

function stubExecCommand(value: unknown) {
  Object.defineProperty(document, 'execCommand', { configurable: true, value });
}

describe('Markdown', () => {
  afterEach(() => {
    stubClipboard(undefined);
    stubExecCommand(undefined);
    vi.useRealTimers();
  });

  it('renders headings from h2, paragraphs, lists, tables and code blocks', () => {
    const { container } = render(<Markdown>{statement}</Markdown>);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Sorting with merge sort' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Input' })).toBeVisible();
    const paragraph = screen.getByText(
      (_, element) => element?.tagName === 'P' && element.textContent === 'Read n integers.',
    );
    expect(within(paragraph).getByText('n').tagName).toBe('CODE');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    const table = screen.getByRole('table');
    expect(table).toHaveClass('lk-table');
    expect(within(table).getByRole('cell', { name: '5000' })).toBeVisible();
    expect(container.querySelector('pre')).toHaveTextContent('6 5 -2 9 -2 0 7');
    expect(container.textContent).not.toContain('```');
    expect(container.textContent).not.toContain('#');
  });

  it('never renders raw HTML: no script, no img with onerror, no javascript: link', () => {
    const { container } = render(
      <Markdown>
        {[
          'Before <script>window.hacked = true</script> after.',
          '',
          '<img src="x" onerror="window.hacked = true">',
          '',
          '<div onclick="window.hacked = true">box</div>',
          '',
          '[link](javascript:window.hacked=true)',
        ].join('\n')}
      </Markdown>,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onerror], [onclick]')).toBeNull();
    expect(container.querySelector('div.lk-markdown div')).toBeNull();
    const link = screen.getByText('link');
    expect(link.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
    expect((window as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it('copies a code block with the fallback when navigator.clipboard is missing (plain HTTP)', async () => {
    stubClipboard(undefined);
    let copied = '';
    const execCommand = vi.fn((command: string) => {
      copied = document.querySelector('textarea')?.value ?? '';
      return command === 'copy';
    });
    stubExecCommand(execCommand);
    render(<Markdown>{statement}</Markdown>);

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép' }));
    expect(await screen.findByText('Đã sao chép')).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(copied).toBe('6\n5 -2 9 -2 0 7');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('uses navigator.clipboard when it exists', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard({ writeText });
    const execCommand = vi.fn(() => true);
    stubExecCommand(execCommand);
    render(<Markdown>{statement}</Markdown>);

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép' }));
    expect(await screen.findByText('Đã sao chép')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('6\n5 -2 9 -2 0 7');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('says when copying failed and clears the message after a short time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubClipboard({ writeText: () => Promise.reject(new Error('denied')) });
    stubExecCommand(() => false);
    render(<Markdown>{statement}</Markdown>);

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép' }));
    expect(await screen.findByText('Không sao chép được')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByText('Không sao chép được')).not.toBeInTheDocument();
  });
});

describe('MarkdownInline', () => {
  it('renders inline code without raw backticks', () => {
    const { container } = render(
      <MarkdownInline>{'Do not call `std::sort` or `qsort`.'}</MarkdownInline>,
    );
    expect(container.textContent).toBe('Do not call std::sort or qsort.');
    expect(screen.getByText('std::sort').tagName).toBe('CODE');
    expect(container.querySelector('p')).toBeNull();
  });

  it('drops block elements and raw HTML', () => {
    const { container } = render(
      <MarkdownInline>{'# Title <img src=x onerror="alert(1)"> text'}</MarkdownInline>,
    );
    expect(container.querySelector('h1, h2, img')).toBeNull();
    expect(container.textContent).toContain('Title');
  });
});
