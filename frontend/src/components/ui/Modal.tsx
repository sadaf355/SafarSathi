import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, children, className, title, subtitle }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Focus trap: move focus into the dialog on open, restore it on close, and
  // keep Tab/Shift+Tab cycling within the dialog rather than leaking to the
  // page behind it.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? dialog)?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-card border border-line bg-white shadow-lift animate-scale-in outline-none',
          className
        )}
      >
        {(title || subtitle) && (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line p-5">
            <div>
              {title && <h2 className="font-display text-lg font-bold text-ink">{title}</h2>}
              {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-ink-muted transition hover:bg-canvas hover:text-ink" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="min-h-0 overflow-y-auto p-5 scrollbar-thin">{children}</div>
      </div>
    </div>,
    document.body
  );
}
