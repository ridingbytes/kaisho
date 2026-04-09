import { ExternalLink, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom";

interface LinkOverlayProps {
  url: string;
  onClose: () => void;
}

/**
 * In-app overlay showing a URL in an iframe. If the site
 * blocks framing, shows a fallback with an "Open in new
 * tab" button.
 */
export function LinkOverlay({
  url,
  onClose,
}: LinkOverlayProps) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () =>
      window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return ReactDOM.createPortal(
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />
      <div
        className={[
          "fixed z-50 inset-4 md:inset-12 lg:inset-16",
          "flex flex-col rounded-xl overflow-hidden",
          "bg-surface-card border border-border",
          "shadow-[var(--shadow-card-drag)]",
        ].join(" ")}
      >
        {/* Toolbar */}
        <div
          className={[
            "flex items-center gap-2 px-3 py-2",
            "border-b border-border-subtle",
            "bg-surface-raised shrink-0",
          ].join(" ")}
        >
          <span
            className={[
              "flex-1 text-xs text-stone-600",
              "font-mono truncate",
            ].join(" ")}
          >
            {url}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "p-1 rounded text-stone-500",
              "hover:text-cta transition-colors",
            ].join(" ")}
            title="Open in new tab"
          >
            <ExternalLink size={12} />
          </a>
          <button
            onClick={onClose}
            className={[
              "p-1 rounded text-stone-500",
              "hover:text-stone-900 transition-colors",
            ].join(" ")}
            title="Close (ESC)"
          >
            <X size={12} />
          </button>
        </div>

        {/* Content */}
        {blocked ? (
          <div
            className={[
              "flex-1 flex flex-col items-center",
              "justify-center gap-4 p-8",
            ].join(" ")}
          >
            <p className="text-sm text-stone-600">
              This site does not allow embedding.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={[
                "px-4 py-2 rounded-lg text-sm",
                "font-semibold bg-cta text-white",
                "hover:bg-cta-hover transition-colors",
              ].join(" ")}
            >
              Open in new tab
            </a>
          </div>
        ) : (
          <iframe
            src={url}
            className="flex-1 w-full bg-white"
            title="Link preview"
            onError={() => setBlocked(true)}
            onLoad={(e) => {
              try {
                // If we can't access contentDocument,
                // the frame loaded but cross-origin
                // blocks might still apply. If the
                // frame is blank/error, the browser
                // shows its own message.
                const doc = (
                  e.target as HTMLIFrameElement
                ).contentDocument;
                void doc;
              } catch {
                // Cross-origin is expected, frame
                // loaded fine
              }
            }}
          />
        )}
      </div>
    </>,
    document.body,
  );
}

/** Hook to manage LinkOverlay open/close state. */
export function useLinkOverlay() {
  const [url, setUrl] = useState<string | null>(null);
  const open = useCallback(
    (href: string) => setUrl(href),
    [],
  );
  const close = useCallback(() => setUrl(null), []);
  return { overlayUrl: url, openOverlay: open, closeOverlay: close };
}

const NEWTAB_HOSTS = [
  "github.com",
  "gitlab.com",
  "bitbucket.org",
];

function shouldOpenInNewTab(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return NEWTAB_HOSTS.some(
      (h) => host === h || host.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}

/**
 * Click handler for <a>: opens GitHub links in a new tab,
 * other links in an in-app overlay. Shift+click always
 * opens in a new tab.
 */
export function handleLinkClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  open: (url: string) => void,
) {
  if (e.shiftKey) return;
  const href = e.currentTarget.href;
  if (!href) return;
  e.preventDefault();
  if (shouldOpenInNewTab(href)) {
    window.open(href, "_blank", "noopener");
  } else {
    open(href);
  }
}
