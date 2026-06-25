/**
 * `TimerScreen` (UI layer) — primary timer content (tasks 13.1–13.3, wired in 14.1).
 *
 * Renders the timer as the PRIMARY content of the main screen on load (Req 1.1)
 * and composes the full timer UI — {@link DurationInput}, {@link TimerDisplay},
 * and {@link TimerControls} — over a single shared `TimerState`/controls pair
 * driven by the pure `TimerEngine` (via {@link useTimer}). While a session is
 * running, the hook's 250 ms tick keeps the displayed remaining time within one
 * second of true elapsed wall-clock time (Req 1.4, 3.3).
 *
 * State source: the screen can either own its timer state (standalone, when no
 * `timer` prop is supplied) or render a lifted state passed down from `App`. In
 * the wired app (`App`, task 14.1) the state is LIFTED so the activity prompt,
 * the activity log, and the timer all agree on the same session — `App` passes
 * its `useTimer` result via the `timer` prop. The two source paths live in
 * separate components so hooks are always called unconditionally and no stray
 * tick interval runs for an unused state.
 *
 * The component delegates ALL timer decisions to the engine — it makes none of
 * its own. Completion handling (the {@link ActivityPrompt}) is coordinated by
 * `App` so it can persist the resulting log entry.
 *
 * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.4, 2.5, 3.2, 3.3, 4.1, 4.5,
 * 4.6, 5.1, 5.4, 5.5_
 */
import type { Clock } from '../types/clock';
import type { TimerState } from '../types/timer';
import { systemClock } from '../infra/clock';
import { useTimer, type TimerControls as TimerControlActions, type UseTimerResult } from './useTimer';
import { DurationInput } from './DurationInput';
import { TimerDisplay } from './TimerDisplay';
import { TimerControls } from './TimerControls';

export interface TimerScreenProps {
  /** Injectable time provider for testability (defaults to {@link systemClock}). */
  clock?: Clock;
  /**
   * Optional lifted timer state + controls. When provided (as `App` does), the
   * screen renders this shared state so the activity prompt and log stay in
   * sync with the timer. When omitted, the screen owns its own timer state.
   */
  timer?: UseTimerResult;
}

/**
 * The main timer screen. Rendered as the primary content on app load.
 */
export function TimerScreen({ clock = systemClock, timer }: TimerScreenProps) {
  if (timer) {
    return <TimerScreenContent state={timer.state} controls={timer.controls} />;
  }
  return <StandaloneTimerScreen clock={clock} />;
}

/** Owns its own timer state via {@link useTimer} (standalone usage). */
function StandaloneTimerScreen({ clock }: { clock: Clock }) {
  const { state, controls } = useTimer(clock);
  return <TimerScreenContent state={state} controls={controls} />;
}

/** Presentational composition of the timer UI over a shared state/controls pair. */
function TimerScreenContent({
  state,
  controls,
}: {
  state: TimerState;
  controls: TimerControlActions;
}) {
  const isRunning = state.status === 'running';

  return (
    <section
      aria-label="Timer"
      className="flex flex-col items-center gap-8 rounded-4xl border border-black/5 bg-white px-6 py-10 shadow-card sm:px-10"
    >
      {/* Remaining time in MM:SS with a circular progress ring (Req 1.3, 1.5). */}
      <TimerDisplay
        remainingSec={state.remainingSec}
        configuredDurationSec={state.configuredDurationSec}
        status={state.status}
        usingDefaultFallback={state.usingDefaultFallback}
      />

      {/* Start / Pause / Resume / Reset wired to the engine actions (Req 3-5). */}
      <TimerControls
        status={state.status}
        lastTransition={state.lastTransition}
        configuredDurationSec={state.configuredDurationSec}
        onStart={controls.start}
        onPause={controls.pause}
        onResume={controls.resume}
        onReset={controls.reset}
      />

      {/* Set the Configured_Duration; disabled while running (Req 2.1, 2.4). */}
      <DurationInput
        configuredDurationSec={state.configuredDurationSec}
        disabled={isRunning}
        onCommit={controls.setDuration}
      />
    </section>
  );
}
