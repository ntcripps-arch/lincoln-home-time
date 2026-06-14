'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// Mobile bottom sheet: backdrop tap / Esc / swipe-down to dismiss, body-scroll
// lock while open, safe-area padding at the bottom. Shared by the calendar day
// detail and the request submit form.
export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40 animate-in fade-in"
      />
      <div
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full max-w-screen-sm flex-col rounded-t-2xl bg-card shadow-xl animate-in slide-in-from-bottom duration-300"
      >
        <div
          onTouchStart={(e) => {
            startY.current = e.touches[0].clientY;
          }}
          onTouchMove={(e) => {
            if (startY.current != null) setDragY(Math.max(0, e.touches[0].clientY - startY.current));
          }}
          onTouchEnd={() => {
            if (dragY > 100) onClose();
            else setDragY(0);
            startY.current = null;
          }}
          className="shrink-0 cursor-grab touch-none px-4 pb-2 pt-3"
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--sab)+1.5rem)] pt-1">
          {children}
        </div>
      </div>
    </div>
  );
}
