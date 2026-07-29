/**
 * `CollapsibleSection` — a simple accordion item with a labelled toggle button.
 * Used to keep the main page lean by hiding Export and Google Sheets behind a
 * single click.
 */
import { useState } from 'react';

export interface CollapsibleSectionProps {
  /** Button label shown when collapsed and expanded. */
  label: string;
  /** Optional description shown next to the label. */
  description?: string;
  children: React.ReactNode;
  /** Start open? Default false. */
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  label,
  description,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-4xl border border-black/5 bg-white shadow-card overflow-hidden">
      {/* Toggle button */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-ink/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ring sm:px-7"
      >
        <div className="flex flex-col">
          <span className="text-base font-semibold tracking-tight text-ink">
            {label}
          </span>
          {description && (
            <span className="text-sm text-ink-muted">{description}</span>
          )}
        </div>

        {/* Chevron rotates when open */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden
          className={`shrink-0 text-ink-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M4 6.5l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Content — rendered but hidden so state inside children is preserved */}
      {open && (
        <div className="border-t border-black/5 px-6 py-6 sm:px-7">
          {children}
        </div>
      )}
    </div>
  );
}
