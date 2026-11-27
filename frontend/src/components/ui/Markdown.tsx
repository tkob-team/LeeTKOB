import { useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyButton } from './CopyButton';

/** Drops react-markdown's `node` prop so it is not spread onto DOM elements. */
type Props<T extends keyof React.JSX.IntrinsicElements> = ComponentPropsWithoutRef<T> & {
  node?: unknown;
};

function domProps<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

function CodeBlock(props: Props<'pre'>) {
  const { children, ...rest } = domProps(props);
  const pre = useRef<HTMLPreElement>(null);
  return (
    <div className="lk-codeblock">
      <pre {...rest} ref={pre}>
        {children}
      </pre>
      <CopyButton getText={() => (pre.current?.textContent ?? '').replace(/\n$/, '')} />
    </div>
  );
}

/**
 * Headings start at h2: the page title is the only h1. Tables use the design-system table.
 * Raw HTML in the source is skipped (`skipHtml`), and react-markdown's default URL filter drops
 * `javascript:` links, so author text can never inject markup or script.
 */
const blockComponents: Components = {
  h1: (props: Props<'h1'>) => <h2 {...domProps(props)} />,
  h2: (props: Props<'h2'>) => <h3 {...domProps(props)} />,
  h3: (props: Props<'h3'>) => <h4 {...domProps(props)} />,
  pre: CodeBlock,
  table: (props: Props<'table'>) => (
    <div className="lk-table-wrap">
      <table {...domProps(props)} className="lk-table" />
    </div>
  ),
};

export interface MarkdownProps {
  children: string;
}

/** A lab statement written in Markdown (GFM: tables, lists, fenced code). */
export function Markdown({ children }: MarkdownProps) {
  return (
    <div className="lk-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={blockComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

const inlineComponents: Components = {
  p: ({ children }: { children?: ReactNode }) => <>{children}</>,
};

/** One line of author text with inline code, emphasis and links only (constraint text). */
export function MarkdownInline({ children }: MarkdownProps) {
  return (
    <span className="lk-markdown-inline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        allowedElements={['p', 'code', 'strong', 'em', 'a', 'del']}
        unwrapDisallowed
        components={inlineComponents}
      >
        {children}
      </ReactMarkdown>
    </span>
  );
}
