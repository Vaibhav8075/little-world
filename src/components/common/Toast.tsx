import React from 'react';
import { useMemory } from '../../context/MemoryContext';
import { Check, AlertCircle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useMemory();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-24 md:bottom-6 z-[80] flex flex-col items-center gap-2 px-4 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 max-w-md pl-4 pr-2 py-2 rounded-full bg-ink text-on-ink shadow-pop animate-enter"
        >
          {toast.type === 'error' ? (
            <AlertCircle className="size-4 text-accent shrink-0" />
          ) : toast.type === 'success' ? (
            <Check className="size-4 shrink-0 opacity-80" />
          ) : null}
          <p className="text-sm">{toast.message}</p>
          <button
            onClick={() => dismissToast(toast.id)}
            className="p-1.5 rounded-full opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
