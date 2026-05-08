/**
 * @module CodeViewer
 *
 * Read-only syntax-highlighted view of a source file.
 * Uses highlight.js with the github theme already loaded
 * by the shared Markdown component.
 *
 * Safety: hljs.highlight()/highlightAuto() escape every
 * input character before wrapping tokens in spans, so the
 * returned HTML is safe to inject. This is the same path
 * the Markdown component uses indirectly via
 * rehype-highlight.
 */

import hljs from "highlight.js";
import { useMemo } from "react";
import "highlight.js/styles/github.min.css";

export interface CodeViewerProps {
  content: string;
  /** highlight.js language id, or null for auto-detect. */
  language: string | null;
}

export function CodeViewer({
  content, language,
}: CodeViewerProps) {
  const html = useMemo(() => {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(
        content, { language, ignoreIllegals: true },
      ).value;
    }
    return hljs.highlightAuto(content).value;
  }, [content, language]);

  // The github hljs theme paints ``.hljs`` with its own
  // white background and padding. Override both to
  // ``transparent``/``0`` so the outer ``<pre>`` is the
  // only visible surface -- otherwise we get a grey frame
  // around an inner white code box.
  return (
    <pre
      className={
        "bg-surface-overlay rounded-lg p-4 " +
        "overflow-x-auto text-sm font-mono " +
        "text-stone-800 leading-relaxed"
      }
    >
      <code
        className={
          language ? `hljs language-${language}` : "hljs"
        }
        style={{ background: "transparent", padding: 0 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}
