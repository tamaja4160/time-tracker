/**
 * `SoundLab` (UI layer).
 *
 * A small "sound playground" letting the user audition the 10 start sounds and
 * 10 end sounds and choose which the timer should use. Previews play on click;
 * the chosen sound for each kind is persisted by the {@link SoundPlayer}.
 *
 * Purely presentational over the injected player: it owns only the local
 * "which is selected" mirror so the radios re-render immediately.
 */
import { useState } from 'react';
import {
  START_SOUNDS,
  END_SOUNDS,
  type SoundKind,
  type SoundPlayer,
} from '../infra/sound';

export interface SoundLabProps {
  player: SoundPlayer;
}

export function SoundLab({ player }: SoundLabProps) {
  const [selStart, setSelStart] = useState(() => player.getSelection('start'));
  const [selEnd, setSelEnd] = useState(() => player.getSelection('end'));

  const selected = { start: selStart, end: selEnd };
  const setSelected = (kind: SoundKind, id: string) => {
    player.setSelection(kind, id);
    if (kind === 'start') setSelStart(id);
    else setSelEnd(id);
  };

  const columns: Array<{ kind: SoundKind; title: string; list: typeof START_SOUNDS }> = [
    { kind: 'start', title: 'Start sound', list: START_SOUNDS },
    { kind: 'end', title: 'End sound', list: END_SOUNDS },
  ];

  return (
    <section
      aria-label="Sound settings"
      className="flex flex-col gap-4 rounded-4xl border border-black/5 bg-white p-6 shadow-card sm:p-7"
    >
      <div className="flex flex-col">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Sounds</h2>
        <p className="text-sm text-ink-muted">
          Tap a sound to preview it, then select the one you want.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {columns.map(({ kind, title, list }) => (
          <fieldset key={kind} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink-soft">{title}</legend>
            {list.map((s) => {
              const isSelected = selected[kind] === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 transition-colors ${
                    isSelected
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-black/5 hover:bg-canvas/60'
                  }`}
                >
                  <label className="flex flex-1 cursor-pointer items-center gap-2.5 text-sm text-ink">
                    <input
                      type="radio"
                      name={`sound-${kind}`}
                      checked={isSelected}
                      onChange={() => setSelected(kind, s.id)}
                      className="h-4 w-4 accent-accent"
                    />
                    {s.label}
                  </label>
                  <button
                    type="button"
                    aria-label={`Preview ${s.label}`}
                    onClick={() => {
                      player.unlock();
                      player.preview(kind, s.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-3 py-1 text-sm font-medium text-ink transition-colors hover:bg-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2"
                  >
                    <span aria-hidden>▶</span> Play
                  </button>
                </div>
              );
            })}
          </fieldset>
        ))}
      </div>
    </section>
  );
}
