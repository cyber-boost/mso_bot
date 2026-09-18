// Pulse store + beat engine.
//
// The engine is the "cron job": a lightweight tab-side scheduler that wakes
// every few seconds, finds pulses whose interval has elapsed, and fires them
// one at a time through the same /api/chat stream the console chat uses.
// Beats stream into each pulse's run log as they land. Everything persists to
// localStorage — no accounts, no server state. Pulses beat while this tab is
// open; a pulse that fell due while the tab was closed fires once on wake.

import { create } from "zustand";
import { streamChat } from "./chat";
import {
  blankPulse,
  clampInterval,
  intervalMs,
  isPulse,
  MAX_RUNS,
  MAX_TASK_CHARS,
  newId,
  pulseSystem,
  pulseUserPrompt,
  type Pulse,
  type PulseMode,
  type PulseRun,
} from "./pulse";
import { useMaestro } from "./store";

const PULSES_KEY = "maestro.pulses";
const TICK_MS = 3_000;
const LIVE_FLUSH_MS = 350;

export type NewPulse = {
  name: string;
  task: string;
  mode: PulseMode;
  providerId: string;
  modelId: string;
  modelName?: string;
  intervalMin: number;
};

type PulseState = {
  hydrated: boolean;
  pulses: Pulse[];
  /** Ids currently streaming a beat. A pulse beats only when this is empty for it. */
  active: string[];
  hydratedError: string | null;
  hydrate: () => void;
  addPulse: (input: NewPulse) => Pulse;
  armStarter: (input: Pick<NewPulse, "name" | "task" | "mode">) => Pulse;
  setEnabled: (id: string, enabled: boolean) => void;
  removePulse: (id: string) => void;
  rename: (id: string, name: string) => void;
  clearRuns: (id: string) => void;
  /** Fire a beat right now, schedule be damned. */
  beatNow: (id: string) => void;
};

function readPulses(): Pulse[] {
  try {
    const raw = localStorage.getItem(PULSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPulse).map((p) => ({
      ...p,
      intervalMin: clampInterval(p.intervalMin),
      runs: p.runs
        .filter((r) => r && typeof r.at === "number" && typeof r.text === "string")
        .map((r) =>
          r.status === "running"
            ? { ...r, status: "error" as const, error: "interrupted", doneAt: r.at }
            : r,
        )
        .slice(0, MAX_RUNS),
    }));
  } catch {
    return [];
  }
}

function persist(pulses: Pulse[]) {
  try {
    localStorage.setItem(PULSES_KEY, JSON.stringify(pulses));
  } catch {
    /* quota — the log just stops persisting */
  }
}

export const usePulses = create<PulseState>((set, get) => ({
  hydrated: false,
  pulses: [],
  active: [],
  hydratedError: null,
  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true, pulses: readPulses() });
  },
  addPulse: (input) => {
    const now = Date.now();
    const p: Pulse = {
      ...blankPulse(now),
      id: newId("pulse"),
      name: input.name.trim() || "Untitled pulse",
      task: input.task.trim().slice(0, MAX_TASK_CHARS),
      mode: input.mode,
      providerId: input.providerId,
      modelId: input.modelId,
      modelName: input.modelName,
      intervalMin: clampInterval(input.intervalMin),
      enabled: true,
      createdAt: now,
      nextRunAt: now + clampInterval(input.intervalMin) * 60_000,
      runs: [],
    };
    set((s) => {
      const pulses = [...s.pulses, p];
      persist(pulses);
      return { pulses };
    });
    return p;
  },
  armStarter: (input) => {
    const sel = useMaestro.getState().selection;
    return get().addPulse({ ...input, ...sel, intervalMin: 5 });
  },
  setEnabled: (id, enabled) =>
    set((s) => {
      const now = Date.now();
      const pulses = s.pulses.map((p) =>
        p.id === id
          ? {
              ...p,
              enabled,
              // Reschedule on resume so the beat doesn't fire instantly for a
              // pulse that sat paused for hours.
              nextRunAt: enabled ? now + intervalMs(p) : p.nextRunAt,
            }
          : p,
      );
      persist(pulses);
      return { pulses };
    }),
  removePulse: (id) =>
    set((s) => {
      const pulses = s.pulses.filter((p) => p.id !== id);
      persist(pulses);
      return { pulses, active: s.active.filter((x) => x !== id) };
    }),
  rename: (id, name) =>
    set((s) => {
      const pulses = s.pulses.map((p) => (p.id === id ? { ...p, name } : p));
      persist(pulses);
      return { pulses };
    }),
  clearRuns: (id) =>
    set((s) => {
      const pulses = s.pulses.map((p) =>
        p.id === id ? { ...p, runs: [], lastRunAt: undefined, lastStatus: undefined } : p,
      );
      persist(pulses);
      return { pulses };
    }),
  beatNow: (id) => {
    const s = get();
    const p = s.pulses.find((x) => x.id === id);
    if (!p || s.active.includes(id)) return;
    if (engineBusy) {
      // Another pulse is mid-beat: pull this one due and let the engine's
      // drain loop pick it up as soon as the current beat lands.
      set((st) => {
        const pulses = st.pulses.map((x) => (x.id === id ? { ...x, nextRunAt: Date.now() } : x));
        persist(pulses);
        return { pulses };
      });
      return;
    }
    void fire(id);
  },
}));

// ---------------------------------------------------------------------------
// Beat engine
// ---------------------------------------------------------------------------

const aborts = new Map<string, AbortController>();
const liveBuffers = new Map<string, { text: string; dirtyAt: number }>();

let engineTimer: ReturnType<typeof setInterval> | null = null;
let engineBusy = false;

export function startPulseEngine(): void {
  if (typeof window === "undefined") return;
  if (engineTimer) return;
  usePulses.getState().hydrate();
  engineTimer = setInterval(tick, TICK_MS);
  // A tab that slept (laptop lid, background tab) fires a catch-up beat for
  // anything that came due while away — once, then the cadence resumes.
  document.addEventListener("visibilitychange", onWake);
}

export function stopPulseEngine(): void {
  if (engineTimer) clearInterval(engineTimer);
  engineTimer = null;
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onWake);
  }
  for (const ac of aborts.values()) ac.abort();
  aborts.clear();
}

function onWake() {
  if (document.visibilityState === "visible") void tick();
}

async function tick() {
  if (engineBusy) return;
  const s = usePulses.getState();
  if (!s.hydrated) return;
  const now = Date.now();
  const due = s.pulses.find(
    (p) => p.enabled && !s.active.includes(p.id) && p.nextRunAt <= now,
  );
  if (due) await fire(due.id);
}

async function fire(id: string): Promise<void> {
  if (engineBusy) return;
  const s = usePulses.getState();
  const pulse = s.pulses.find((p) => p.id === id);
  if (!pulse || s.active.includes(id)) return;

  engineBusy = true;
  const runId = newId("run");
  const at = Date.now();
  const ac = new AbortController();
  aborts.set(id, ac);
  liveBuffers.set(id, { text: "", dirtyAt: 0 });

  patchPulse(id, (p) => ({
    ...p,
    runs: [
      { id: runId, at, status: "running" as const, text: "" },
      ...p.runs,
    ].slice(0, MAX_RUNS),
  }));
  usePulses.setState((s) => ({ active: [...s.active, id] }));

  // Throttled live-stream flushes so the beat log ripples without hammering
  // the layout on every token.
  const flush = setInterval(() => {
    const buf = liveBuffers.get(id);
    if (!buf || Date.now() - buf.dirtyAt < LIVE_FLUSH_MS) return;
    buf.dirtyAt = Date.now();
    patchRun(id, runId, { text: buf.text });
  }, LIVE_FLUSH_MS);

  const { keys } = useMaestro.getState();
  let status: PulseRun["status"] = "ok";
  let error: string | undefined;
  let usage: { prompt?: number; completion?: number } | undefined;

  try {
    const result = await streamChat(
      {
        providerId: pulse.providerId,
        modelId: pulse.modelId,
        messages: [
          { role: "system", content: pulseSystem(pulse.mode, pulse.intervalMin) },
          { role: "user", content: pulseUserPrompt(pulse, at) },
        ],
        temperature: 0.8,
        maxTokens: 1024,
        apiKey: keys[pulse.providerId] || undefined,
      },
      (acc) => {
        const buf = liveBuffers.get(id);
        if (buf) buf.text = acc;
      },
      ac.signal,
    );
    usage = result.usage;
  } catch (e) {
    if ((e as Error).name !== "AbortError" || !ac.signal.aborted) {
      status = "error";
      error = e instanceof Error ? e.message : "Beat failed";
    } else {
      status = "error";
      error = "stopped";
    }
  } finally {
    clearInterval(flush);
    aborts.delete(id);
    const buf = liveBuffers.get(id);
    liveBuffers.delete(id);
    const finalText = buf?.text ?? "";
    const doneAt = Date.now();
    patchPulse(id, (p) => ({
      ...p,
      lastRunAt: doneAt,
      lastStatus: status === "ok" ? "ok" : "error",
      nextRunAt: doneAt + intervalMs(p),
      runs: p.runs.map((r) =>
        r.id === runId
          ? {
              ...r,
              status,
              error,
              doneAt,
              text: finalText || r.text,
              promptTokens: usage?.prompt,
              completionTokens: usage?.completion,
            }
          : r,
      ),
    }));
    usePulses.setState((s) => ({ active: s.active.filter((x) => x !== id) }));
    engineBusy = false;
    // Back-to-back due pulses (returned from a long sleep) beat in sequence.
    void tick();
  }
}

export function abortBeat(id: string): void {
  aborts.get(id)?.abort();
}

function patchPulse(id: string, fn: (p: Pulse) => Pulse) {
  usePulses.setState((s) => {
    const pulses = s.pulses.map((p) => (p.id === id ? fn(p) : p));
    persist(pulses);
    return { pulses };
  });
}

function patchRun(id: string, runId: string, patch: Partial<PulseRun>) {
  patchPulse(id, (p) => ({
    ...p,
    runs: p.runs.map((r) => (r.id === runId ? { ...r, ...patch } : r)),
  }));
}
