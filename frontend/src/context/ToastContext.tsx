import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { Check, Info, AlertTriangle, X } from "lucide-react";
import ReactDOM from "react-dom";

type ToastType = "success" | "info" | "error";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

let nextId = 0;

const ICONS: Record<ToastType, React.ElementType> = {
  success: Check,
  info: Info,
  error: AlertTriangle,
};

const COLORS: Record<ToastType, string> = {
  success: "text-emerald-500",
  info: "text-cta",
  error: "text-red-500",
};

const AUTO_DISMISS_MS = 3000;

function ToastItem({
  t,
  onDismiss,
}: {
  t: Toast;
  onDismiss: () => void;
}) {
  const Icon = ICONS[t.type];
  return (
    <div
      className={[
        "flex items-center gap-2 px-4 py-2.5",
        "rounded-lg shadow-lg border border-border",
        "bg-surface-card text-sm text-stone-800",
        "animate-[slideIn_0.2s_ease-out]",
      ].join(" ")}
    >
      <Icon size={14} className={COLORS[t.type]} />
      <span className="flex-1">{t.message}</span>
      <button
        onClick={onDismiss}
        className={[
          "p-0.5 rounded text-stone-400",
          "hover:text-stone-700 transition-colors",
        ].join(" ")}
      >
        <X size={12} />
      </button>
    </div>
  );
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return ReactDOM.createPortal(
    <div
      className={[
        "fixed bottom-4 right-4 left-4",
        "md:left-auto md:w-80",
        "z-[70] flex flex-col gap-2",
        "pointer-events-none",
      ].join(" ")}
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem
            t={t}
            onDismiss={() => onDismiss(t.id)}
          />
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).toast;
}
