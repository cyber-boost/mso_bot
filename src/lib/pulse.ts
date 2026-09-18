// Pulse — a cron job for your models that looks a lot cooler.
// Every pulse wakes its model on a fixed interval (default: every 5 minutes),
// hands it a task, and streams the result into a beat log. Two modes:
//   auto   — the model does the task by itself, end to end.
//   assist — the model drafts; you finish by hand.

export type PulseMode = "auto" | "assist";

export type PulseRunStatus = "running" | "ok" | "error";

export type PulseRun = {
  id: string;
  /** When this beat fired (epoch ms). */
  at: number;
  /** When streaming finished (epoch ms); undefined while running. */
  doneAt?: number;
  status: PulseRunStatus;
  text: string;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
};

export type Pulse = {
  id: string;
  name: string;
  /** The standing task handed to the model on every beat. */
  task: string;
  mode: PulseMode;
  providerId: string;
  modelId: string;
  modelName?: string;
  /** Beat interval in minutes. The classic is 5. */
  intervalMin: number;
  enabled: boolean;
  createdAt: number;
  nextRunAt: number;
  lastRunAt?: number;
  lastStatus?: Exclude<PulseRunStatus, "running">;
  /** Newest first. Capped at MAX_RUNS. */
  runs: PulseRun[];
};

export const DEFAULT_INTERVAL_MIN = 5;
export const MIN_INTERVAL_MIN = 1;
export const MAX_INTERVAL_MIN = 120;
export const MAX_RUNS = 24;
export const MAX_TASK_CHARS = 2000;

export const INTERVAL_PRESETS = [1, 5, 15, 30, 60] as const;

export function clampInterval(min: number): number {
  if (!Number.isFinite(min)) return DEFAULT_INTERVAL_MIN;
  return Math.min(Math.max(Math.round(min), MIN_INTERVAL_MIN), MAX_INTERVAL_MIN);
}

export function intervalMs(p: Pick<Pulse, "intervalMin">): number {
  return clampInterval(p.intervalMin) * 60_000;
}

/** The classic crontab expression for a fixed minute cadence. */
export function cronFor(intervalMin: number): string {
  const m = clampInterval(intervalMin);
  if (m >= 60 && m % 60 === 0) {
    const h = m / 60;
    return h === 1 ? "0 * * * *" : `0 */${h} * * *`;
  }
  return m === 1 ? "* * * * *" : `*/${m} * * * *`;
}

/** "T-04:37" countdown until the next beat, or a beat glyph when due. */
export function countdown(to: number, now: number): string {
  const ms = to - now;
  if (ms <= 0) return "···";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `T-${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 0..1 progress through the current interval (drives the ring). */
export function cycleProgress(p: Pulse, now: number): number {
  const span = intervalMs(p);
  const start = p.nextRunAt - span;
  const v = (now - start) / span;
  return Math.min(Math.max(v, 0), 1);
}

export function relativeTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function clockTime(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

const AUTO_SYSTEM = `You are a Pulse — an autonomous task beating on a cron schedule inside the Maestro model console.
Every {interval} minutes you wake, do the standing task below, and go back to sleep.
Rules:
- Do the task by yourself, fully. Output finished work, never a plan for it.
- Keep each beat self-contained and compact — it lands in a rolling beat log.
- If nothing changed since your last beat, say what is unchanged in one line instead of repeating yourself.`;

const ASSIST_SYSTEM = `You are a Pulse — a scheduled helper beating on a cron schedule inside the Maestro model console.
Every {interval} minutes you wake and help the user make the thing described below.
Rules:
- Draft the work for them — concrete, usable, edited to fit — not advice about it.
- Keep each beat compact; it lands in a rolling beat log the user reviews.
- End every beat with exactly one line starting "By hand:" naming what the human still has to do themselves.`;

export function pulseSystem(mode: PulseMode, intervalMin: number): string {
  const tpl = mode === "assist" ? ASSIST_SYSTEM : AUTO_SYSTEM;
  return tpl.replace("{interval}", String(clampInterval(intervalMin)));
}

export function pulseUserPrompt(p: Pulse, now: number): string {
  const parts = [p.task.trim()];
  const prev = p.runs.find((r) => r.status !== "running" && r.text.trim());
  if (prev) {
    const ago = relativeTime(prev.at, now);
    parts.push(
      `---\nYour last beat (${ago}, ${prev.status}):\n${prev.text.slice(0, 1200)}`,
    );
  }
  return parts.join("\n\n");
}

let idSeq = 0;
export function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function blankPulse(now: number): Pulse {
  return {
    id: newId("pulse"),
    name: "Untitled pulse",
    task: "",
    mode: "auto",
    providerId: "xai",
    modelId: "grok-4.5",
    modelName: undefined,
    intervalMin: DEFAULT_INTERVAL_MIN,
    enabled: true,
    createdAt: now,
    nextRunAt: now + DEFAULT_INTERVAL_MIN * 60_000,
    runs: [],
  };
}

export function isPulse(v: unknown): v is Pulse {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<Pulse>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.task === "string" &&
    (p.mode === "auto" || p.mode === "assist") &&
    typeof p.providerId === "string" &&
    typeof p.modelId === "string" &&
    typeof p.intervalMin === "number" &&
    Array.isArray(p.runs)
  );
}

/** Starter pulses to show off the feature — one click, five-minute heartbeat. */
export const PULSE_STARTERS: {
  name: string;
  task: string;
  mode: PulseMode;
}[] = [
  {
    name: "Idea forge",
    mode: "auto",
    task: "Every beat, invent one small, genuinely buildable product idea for a solo developer. Name it, say the one-sentence pitch, and the core mechanic in one line. Never repeat an earlier idea.",
  },
  {
    name: "Standup scribe",
    mode: "assist",
    task: "Draft my standup update. Three bullets: what moved, what is stuck, what is next. Base it on the previous beat and push each thread one step forward.",
  },
  {
    name: "Zen watch",
    mode: "auto",
    task: "Deliver one short grounding thought for a working engineer — a single sentence, no greeting, no explanation. A different flavor each beat: systems, craft, patience, or play.",
  },
];
