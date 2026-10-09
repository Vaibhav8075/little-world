import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Stack above other modals (e.g. confirm dialogs). */
  elevated?: boolean;
}

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
};

let openCount = 0;
let overflowBeforeOpen = '';

/** Bottom sheet on phones, centred dialog from `sm` up. Handles Escape and scroll lock. */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
  elevated,
}) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (openCount === 0) overflowBeforeOpen = document.body.style.overflow;
    openCount += 1;
    const depth = openCount;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      // Only the top-most modal reacts to Escape.
      if (e.key === 'Escape' && depth === openCount) {
        e.stopImmediatePropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    // Move focus into the dialog, unless a field inside it already took focus (autoFocus, PIN box).
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', onKey, true);
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = overflowBeforeOpen;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${elevated ? 'z-[70]' : 'z-[60]'} flex items-end sm:items-center justify-center sm:p-6`}
      data-modal-open
    >
      <div className="absolute inset-0 bg-black/45 animate-fade" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`relative w-full ${SIZES[size]} max-h-[92dvh] flex flex-col bg-surface text-ink rounded-t-3xl sm:rounded-2xl shadow-pop animate-enter outline-none`}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 sm:pt-6 pb-4">
            <div className="min-w-0">
              {title && <h2 className="font-serif text-2xl leading-tight">{title}</h2>}
              {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="icon-btn -mr-2 -mt-1 shrink-0" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-5 sm:pb-6">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-4 border-t border-line pb-safe">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
