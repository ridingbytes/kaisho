import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github.min.css";

interface MarkdownProps {
  children: string;
  className?: string;
  /** Called on link click. If provided, handles the click. */
  onLinkClick?: (url: string) => void;
  /**
   * Compact rendering mode for small surfaces (tray
   * panel, tooltips, hover cards). Drops a level off
   * heading sizes and shrinks vertical rhythm.
   */
  compact?: boolean;
}

const components = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-lg font-bold text-stone-900 mt-5 mb-2 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-base font-semibold text-stone-900 mt-4 mb-1.5 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-stone-800 mt-3 mb-1 first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm text-stone-800 leading-relaxed mb-3 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-outside pl-5 mb-3 space-y-1 text-sm text-stone-800">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-outside pl-5 mb-3 space-y-1 text-sm text-stone-800">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  code: ({
    inline,
    children,
  }: {
    inline?: boolean;
    children?: React.ReactNode;
  }) =>
    inline ? (
      <code className="px-1 py-0.5 rounded bg-surface-overlay text-cta text-[0.8em] font-mono">
        {children}
      </code>
    ) : (
      <code>{children}</code>
    ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-surface-overlay rounded-lg p-3 mb-3 overflow-x-auto text-sm font-mono text-stone-800 leading-relaxed">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-cta pl-3 mb-3 text-stone-700 italic">
      {children}
    </blockquote>
  ),
  a: ({
    href,
    children,
  }: {
    href?: string;
    children?: React.ReactNode;
  }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-cta hover:text-cta-hover underline"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="border-border my-4" />,
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-stone-900">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-stone-800">{children}</em>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto mb-3">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="text-left px-3 py-1.5 border-b border-border text-stone-800 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-1.5 border-b border-border-subtle text-stone-700">
      {children}
    </td>
  ),
};

function makeLink(
  onLinkClick?: (url: string) => void,
) {
  return ({
    href,
    children,
  }: {
    href?: string;
    children?: React.ReactNode;
  }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-cta hover:text-cta-hover underline"
      onClick={
        onLinkClick
          ? (e: React.MouseEvent<HTMLAnchorElement>) => {
              if (!e.shiftKey && href) {
                e.preventDefault();
                onLinkClick(href);
              }
            }
          : undefined
      }
    >
      {children}
    </a>
  );
}

// Compact renderers for cramped contexts. Shrink each
// element by roughly one tier and tighten vertical
// spacing. Inline code, links, and emphasis are kept as
// in the default map since their sizes are inherited.
const compactComponents = {
  ...components,
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-sm font-bold text-stone-900 mt-2 mb-1 first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-xs font-semibold text-stone-900 mt-2 mb-1 first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="text-xs font-semibold text-stone-800 mt-1.5 mb-0.5 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-xs text-stone-700 leading-relaxed mb-1.5 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-outside pl-4 mb-1.5 space-y-0.5 text-xs text-stone-700">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-outside pl-4 mb-1.5 space-y-0.5 text-xs text-stone-700">
      {children}
    </ol>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-surface-overlay rounded p-2 mb-1.5 overflow-x-auto text-[11px] font-mono text-stone-800 leading-relaxed">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-cta pl-2 mb-1.5 text-stone-700 italic text-xs">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border my-2" />,
};


export function Markdown({
  children,
  className,
  onLinkClick,
  compact,
}: MarkdownProps) {
  const base = compact ? compactComponents : components;
  const merged = onLinkClick
    ? { ...base, a: makeLink(onLinkClick) }
    : base;
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={merged as never}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
