/**
 * `SettingsPanel` — a slide-in settings drawer accessible from the header gear icon.
 *
 * Consolidates:
 * - Sound on/off toggle
 * - Start sound: dropdown + preview button
 * - End sound: dropdown + preview button
 * - Desktop notifications enable/status
 */
import { useRef, useEffect } from 'react';
import { START_SOUNDS, END_SOUNDS, type SoundKind } from '../infra/sound';
import type { NotificationPermissionState } from '../infra/notifications';

export interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;

  soundEnabled: boolean;
  onToggleSound: () => void;

  selStart: string;
  selEnd: string;
  onSelectSound: (kind: SoundKind, id: string) => void;
  onPreviewSound: (kind: SoundKind, id: string) => void;

  notifPermission: NotificationPermissionState;
  onEnableNotifications: () => void;
}

export function SettingsPanel({
  open,
  onClose,
  soundEnabled,
  onToggleSound,
  selStart,
  selEnd,
  onSelectSound,
  onPreviewSound,
  notifPermission,
  onEnableNotifications,
}: SettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Focus trap: move focus inside when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => firstFocusRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/20 backdrop-blur-sm"
          aria-hidden
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
        className={`fixed right-0 top-0 z-30 h-full w-full max-w-sm overflow-y-auto bg-canvas shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/8 px-6 py-5 dark:border-white/10">
          <h2 className="text-base font-semibold tracking-tight text-ink">Settings</h2>
          <button
            ref={firstFocusRef}
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-ink/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-7 px-6 py-6">
          {/* ── Sound ─────────────────────────────────────── */}
          <section aria-labelledby="settings-sound-heading">
            <h3 id="settings-sound-heading" className="mb-4 text-sm font-semibold uppercase tracking-widest text-ink-muted">
              Sound
            </h3>

            {/* On/off toggle */}
            <div className="mb-5 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Enable sounds</span>
              <button
                type="button"
                role="switch"
                aria-checked={soundEnabled}
                onClick={onToggleSound}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 ${
                  soundEnabled ? 'bg-ink' : 'bg-ink/20'
                }`}
              >
                <span className="sr-only">{soundEnabled ? 'Disable sounds' : 'Enable sounds'}</span>
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-canvas shadow transition-transform ${
                    soundEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Start sound */}
            <SoundSelector
              kind="start"
              label="Start sound"
              sounds={START_SOUNDS}
              selected={selStart}
              disabled={!soundEnabled}
              onSelect={(id) => onSelectSound('start', id)}
              onPreview={(id) => onPreviewSound('start', id)}
            />

            {/* End / alarm sound */}
            <SoundSelector
              kind="end"
              label="End sound"
              sounds={END_SOUNDS}
              selected={selEnd}
              disabled={!soundEnabled}
              onSelect={(id) => onSelectSound('end', id)}
              onPreview={(id) => onPreviewSound('end', id)}
            />
          </section>

          {/* ── Notifications ─────────────────────────────── */}
          {notifPermission !== 'unsupported' && (
            <section aria-labelledby="settings-notif-heading">
              <h3 id="settings-notif-heading" className="mb-4 text-sm font-semibold uppercase tracking-widest text-ink-muted">
                Notifications
              </h3>

              {notifPermission === 'granted' ? (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <span aria-hidden className="text-emerald-600">●</span>
                  Desktop notifications are on
                </p>
              ) : notifPermission === 'denied' ? (
                <p className="text-sm text-ink-muted">
                  Notifications are blocked — enable them for this site in your browser settings.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-ink-muted">
                    Get a desktop alert when a session ends.
                  </p>
                  <button
                    type="button"
                    onClick={onEnableNotifications}
                    className="self-start rounded-full bg-ink/5 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2"
                  >
                    Enable notifications
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* SoundSelector — labelled dropdown + preview play button                     */
/* -------------------------------------------------------------------------- */

interface SoundSelectorProps {
  kind: SoundKind;
  label: string;
  sounds: Array<{ id: string; label: string }>;
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
}

function SoundSelector({ kind, label, sounds, selected, disabled, onSelect, onPreview }: SoundSelectorProps) {
  const selectId = `sound-select-${kind}`;
  return (
    <div className="mb-4">
      <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="flex gap-2">
        <select
          id={selectId}
          value={selected}
          disabled={disabled}
          onChange={(e) => onSelect(e.target.value)}
          className="flex-1 rounded-xl border border-black/10 bg-canvas px-3 py-2 text-sm text-ink transition-colors focus:border-ink/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-40"
        >
          {sounds.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={`Preview ${label}`}
          disabled={disabled}
          onClick={() => onPreview(selected)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-canvas px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:opacity-40"
        >
          <span aria-hidden>▶</span>
          <span className="sr-only sm:not-sr-only">Play</span>
        </button>
      </div>
    </div>
  );
}
