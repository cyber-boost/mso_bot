import {
  AlarmClock,
  Check,
  ChevronDown,
  Clipboard,
  HeartPulse,
  OctagonX,
  Pause,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ProviderLogo } from "@/components/provider-logo";
import { Button } from "@/components/ui/button";
import {
  clockTime,
  countdown,
  cronFor,
  cycleProgress,
  INTERVAL_PRESETS,
  MAX_INTERVAL_MIN,
  MAX_TASK_CHARS,
  MIN_INTERVAL_MIN,
  PULSE_STARTERS,
  relativeTime,
  type Pulse,
  type PulseMode,
  type PulseRun,
} from "@/lib/pulse";
import { abortBeat, usePulses } from "@/lib/pulse-store";
import { useMaestro } from "@/lib/store";
import type { CatalogIndex } from "@/lib/types";
import { cn, formatTokens } from "@/lib/utils";

export function PulsePanel({ index }: { index: CatalogIndex }) {
  const { pulses, active, hydrated, hydratedError, armStarter, addPulse } = usePulses();
  const keys = useMaestro((s) => s.keys);
  const selection = useMaestro((s) => s.selection);
  const now = useNow(1000);
  const [formOpen, setFormOpen] = useState(false);

  const enabled = pulses.filter((p) => p.enabled);
  const nextBeat = enabled
    .filter((p) => !active.includes(p.id))
    .reduce<number | null>((acc, p) => (acc == null ? p.nextRunAt : Math.min(acc, p.nextRunAt)), null);
  const totalBeats = pulses.reduce(
    (acc, p) => acc + p.runs.filter((r) => r.status !== "running").length,
    0,
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-display text-2xl italic tracking-tight">
                <HeartPulse className="size-5 text-ok" aria-hidden="true" />
                Pulse
              </h2>
              <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted">
                A cron job that runs every five minutes, wearing a much better outfit.
                Give a model a standing task; it wakes on the beat and does the work —
                by itself, or drafting alongside you.
              </p>
            </div>
            <PulseStats
              live={active.length}
              active={enabled.length}
              total={pulses.length}
              nextBeat={nextBeat}
              beats={totalBeats}
              now={now}
            />
          </div>
          <EkgStrip live={active.length > 0} />
          {hydratedError ? <p className="text-xs text-danger">{hydratedError}</p> : null}
        </header>

        {hydrated && pulses.length === 0 ? (
          <EmptyPulse onStarter={(s) => armStarter(s)} onCompose={() => setFormOpen(true)} />
        ) : null}

        <div className="flex flex-col gap-3">
          {pulses.map((p) => (
            <PulseCard key={p.id} pulse={p} index={index} now={now} />
          ))}
        </div>

        <section className="rounded-lg bg-surface shadow-[0_0_0_1px_var(--color-border)]">
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className={cn(
              "flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-fg",
              (formOpen || pulses.length === 0) && "border-b border-border",
            )}
            aria-expanded={formOpen || pulses.length === 0}
          >
            <Plus
              className={cn(
                "size-4 text-muted transition-transform duration-150",
                (formOpen || pulses.length === 0) && "rotate-45",
              )}
            />
            New pulse
            <span className="ml-auto text-micro text-subtle">
              every 5min · cron {cronFor(5)}
            </span>
          </button>
          {formOpen || pulses.length === 0 ? (
            <NewPulseForm
              index={index}
              keysReady={(pid) => Boolean(keys[pid]) || (pid === "xai" && index.xaiReady)}
              defaultSel={selection}
              onCreate={(input) => {
                addPulse(input);
                setFormOpen(false);
              }}
            />
          ) : null}
        </section>

        <p className="text-center text-micro leading-relaxed text-subtle">
          Beats fire while this console is open. Missed beats catch up once when you return.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(t);
  }, [stepMs]);
  return now;
}

function PulseStats({
  live,
  active,
  total,
  nextBeat,
  beats,
  now,
}: {
  live: number;
  active: number;
  total: number;
  nextBeat: number | null;
  beats: number;
  now: number;
}) {
  return (
    <dl className="flex items-center gap-4 text-right">
      <div>
        <dt className="text-micro uppercase tracking-wider text-subtle">live</dt>
        <dd className={cn("font-display text-xl italic", live > 0 ? "text-ok" : "text-fg")}>
          {live}
        </dd>
      </div>
      <div>
        <dt className="text-micro uppercase tracking-wider text-subtle">armed</dt>
        <dd className="font-display text-xl italic text-fg">
          {active}
          <span className="text-sm text-muted">/{total}</span>
        </dd>
      </div>
      <div>
        <dt className="text-micro uppercase tracking-wider text-subtle">next beat</dt>
        <dd className="font-display text-xl italic text-fg">
          {nextBeat != null ? countdown(nextBeat, now).replace("T-", "") : "—"}
        </dd>
      </div>
      <div className="hidden sm:block">
        <dt className="text-micro uppercase tracking-wider text-subtle">beats</dt>
        <dd className="font-display text-xl italic text-fg">{beats}</dd>
      </div>
    </dl>
  );
}

/** The flat-line-to-spike strip. Sweeps always; quickens while a beat streams. */
function EkgStrip({ live }: { live: boolean }) {
  return (
    <div
      className="relative overflow-hidden rounded-lg bg-surface shadow-[0_0_0_1px_var(--color-border)]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 800 72" className="block h-16 w-full" preserveAspectRatio="none">
        <path className="ekg-base" d={EKG_PATH} />
        <path
          className="ekg-sweep"
          d={EKG_PATH}
          style={live ? { animationDuration: "1.4s" } : undefined}
        />
      </svg>
      <span className="absolute right-3 top-2 text-micro uppercase tracking-widest text-subtle">
        {live ? "beat in progress" : "monitoring"}
      </span>
    </div>
  );
}

/** One 200px heartbeat motif, tiled 4× across the 800px strip. */
const EKG_SEG =
  "h58 c5-9 13-9 18 0 h24 l5 5 l5-33 l9 45 l6-17 h16 c6-11 16-11 21 0 h38";
const EKG_PATH = `M0 36 ${EKG_SEG} ${EKG_SEG} ${EKG_SEG} ${EKG_SEG}`;

/* ------------------------------------------------------------------ */

function PulseCard({ pulse, index, now }: { pulse: Pulse; index: CatalogIndex; now: number }) {
  const { setEnabled, removePulse, beatNow, clearRuns } = usePulses();
  const keys = useMaestro((s) => s.keys);
  const setView = useMaestro((s) => s.setView);
  const active = usePulses((s) => s.active.includes(pulse.id));
  const [open, setOpen] = useState(false);
  const [flashed, setFlashed] = useState<number | null>(null);

  const provider = index.providers.find((p) => p.id === pulse.providerId);
  const keyReady = Boolean(keys[pulse.providerId]) || (pulse.providerId === "xai" && index.xaiReady);
  const doneRuns = pulse.runs.filter((r) => r.status !== "running");
  const latestDone = doneRuns[0];

  // A quick glow when a beat lands — the card flashes once.
  const lastDoneAt = latestDone?.doneAt;
  useEffect(() => {
    if (!lastDoneAt) return;
    setFlashed(lastDoneAt);
    const t = setTimeout(() => setFlashed(null), 950);
    return () => clearTimeout(t);
  }, [lastDoneAt]);

  return (
    <article className="relative overflow-hidden rounded-lg bg-surface shadow-[0_0_0_1px_var(--color-border)]">
      {flashed ? (
        <span
          key={flashed}
          className="beat-flash pointer-events-none absolute inset-0 bg-ok/10"
          aria-hidden="true"
        />
      ) : null}
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          className={cn(
            "mt-1.5 inline-flex size-2.5 shrink-0 rounded-full",
            active ? "bg-ok pulse-dot pulse-dot-fast" : pulse.enabled ? "bg-ok pulse-dot" : "bg-subtle",
          )}
          title={active ? "Beating now" : pulse.enabled ? "Armed" : "Paused"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="truncate text-sm text-fg">{pulse.name}</h3>
            <span
              className={cn(
                "rounded-full px-2 py-px text-micro uppercase tracking-wider",
                pulse.mode === "auto" ? "bg-elevated text-ok" : "bg-elevated text-muted",
              )}
            >
              {pulse.mode === "auto" ? "auto" : "assist"}
            </span>
            {!keyReady ? (
              <button
                type="button"
                onClick={() => setView("keys")}
                className="rounded-full bg-elevated px-2 py-px text-micro uppercase tracking-wider text-danger"
              >
                needs key
              </button>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{pulse.task}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-subtle">
            <span className="inline-flex items-center gap-1.5">
              <ProviderLogo
                id={pulse.providerId}
                name={provider?.name ?? pulse.providerId}
                size="sm"
              />
              {pulse.modelName ?? pulse.modelId}
            </span>
            <span className="inline-flex items-center gap-1">
              <AlarmClock className="size-3" aria-hidden="true" />
              every {pulse.intervalMin}m
            </span>
            <span className="text-subtle">{cronFor(pulse.intervalMin)}</span>
            {latestDone ? (
              <span>
                last {relativeTime(latestDone.at, now)}
                {latestDone.status === "error" ? " · errored" : ""}
              </span>
            ) : (
              <span>no beats yet</span>
            )}
          </div>
        </div>
        {pulse.enabled ? (
          <BeatRing progress={cycleProgress(pulse, now)} label={countdown(pulse.nextRunAt, now)} live={active} />
        ) : null}
      </div>

      <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
        {active ? (
          <CardButton onClick={() => abortBeat(pulse.id)} icon={OctagonX} label="Stop" />
        ) : (
          <CardButton onClick={() => beatNow(pulse.id)} icon={Zap} label="Beat now" />
        )}
        <CardButton
          onClick={() => setEnabled(pulse.id, !pulse.enabled)}
          icon={pulse.enabled ? Pause : Play}
          label={pulse.enabled ? "Pause" : "Resume"}
        />
        <CardButton
          onClick={() => clearRuns(pulse.id)}
          icon={Trash2}
          label="Clear log"
          disabled={pulse.runs.length === 0}
        />
        <ConfirmDelete onConfirm={() => removePulse(pulse.id)} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-micro text-muted hover:text-fg"
          aria-expanded={open}
        >
          Beat log ({pulse.runs.length})
          <ChevronDown
            className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")}
          />
        </button>
      </div>

      {open ? <RunLog pulse={pulse} now={now} /> : null}
    </article>
  );
}

function CardButton({
  onClick,
  icon: Icon,
  label,
  disabled,
}: {
  onClick: () => void;
  icon: typeof Zap;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-micro text-muted transition-colors duration-150 hover:bg-elevated hover:text-fg disabled:cursor-default disabled:opacity-40"
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ConfirmDelete({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2200);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-micro transition-colors duration-150",
        armed ? "bg-danger/15 text-danger" : "text-muted hover:bg-elevated hover:text-fg",
      )}
    >
      <OctagonX className="size-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">{armed ? "Confirm" : "Delete"}</span>
    </button>
  );
}

function BeatRing({ progress, label, live }: { progress: number; label: string; live: boolean }) {
  const R = 15.5;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative flex size-16 shrink-0 items-center justify-center" title="Next beat">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={R}
          fill="none"
          stroke="color-mix(in oklab, var(--color-fg) 10%, transparent)"
          strokeWidth="2.5"
        />
        <circle
          cx="20"
          cy="20"
          r={R}
          fill="none"
          stroke="var(--color-ok)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className={cn("text-micro tabular-nums", live ? "text-ok" : "text-muted")}>
        {live ? "LIVE" : label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RunLog({ pulse, now }: { pulse: Pulse; now: number }) {
  if (pulse.runs.length === 0) {
    return (
      <p className="border-t border-border px-4 py-4 text-xs text-subtle">
        No beats yet. The first fires {countdown(pulse.nextRunAt, now)} — or hit Beat now.
      </p>
    );
  }
  return (
    <ol className="terminal-scroll flex max-h-80 flex-col gap-3 overflow-y-auto border-t border-border px-4 py-3">
      {pulse.runs.map((r) => (
        <RunRow key={r.id} run={r} now={now} mode={pulse.mode} />
      ))}
    </ol>
  );
}

function RunRow({ run, now, mode }: { run: PulseRun; now: number; mode: PulseMode }) {
  const [copied, setCopied] = useState(false);
  const secs = run.doneAt ? Math.max(0, Math.round((run.doneAt - run.at) / 1000)) : null;
  const tokens = (run.promptTokens ?? 0) + (run.completionTokens ?? 0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(run.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-subtle">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 uppercase tracking-wider",
            run.status === "ok" && "text-ok",
            run.status === "error" && "text-danger",
            run.status === "running" && "text-fg",
          )}
        >
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              run.status === "running" ? "bg-ok pulse-dot pulse-dot-fast" : run.status === "ok" ? "bg-ok" : "bg-danger",
            )}
          />
          {run.status === "running" ? "beating" : run.status}
        </span>
        <span title={relativeTime(run.at, now)}>{clockTime(run.at)}</span>
        {secs != null ? <span>{secs}s</span> : null}
        {tokens > 0 ? <span>{formatTokens(tokens)} tok</span> : null}
        {mode === "assist" && run.status !== "running" ? (
          <span className="text-muted">draft for your hands</span>
        ) : null}
        {run.text ? (
          <button
            type="button"
            onClick={copy}
            className="ml-auto inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-subtle hover:text-fg"
          >
            {copied ? <Check className="size-3" /> : <Clipboard className="size-3" />}
            {copied ? "copied" : "copy"}
          </button>
        ) : null}
      </div>
      {run.error ? <p className="text-xs text-danger">{run.error}</p> : null}
      {run.text ? (
        <pre className="whitespace-pre-wrap break-words rounded-md bg-bg px-3 py-2 font-mono text-xs leading-relaxed text-fg">
          {run.text}
          {run.status === "running" ? <span className="maestro-caret" /> : null}
        </pre>
      ) : run.status === "running" ? (
        <p className="maestro-shimmer text-xs">the model is on the beat…</p>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */

function EmptyPulse({
  onStarter,
  onCompose,
}: {
  onStarter: (s: (typeof PULSE_STARTERS)[number]) => void;
  onCompose: () => void;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-[0_0_0_1px_var(--color-border)]">
      <div>
        <h3 className="font-display text-xl italic tracking-tight">
          Put your models on a heartbeat.
        </h3>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
          Pick a starter and it starts beating on the current model, every five minutes, no
          questions asked — or compose your own below.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {PULSE_STARTERS.map((s) => (
          <li key={s.name}>
            <button
              type="button"
              onClick={() => onStarter(s)}
              className="flex h-full w-full flex-col gap-1.5 rounded-lg bg-elevated p-3 text-left transition-colors duration-150 hover:bg-bg"
            >
              <span className="flex items-center gap-1.5 text-sm text-fg">
                <Zap className="size-3.5 text-ok" aria-hidden="true" />
                {s.name}
                <span className="ml-auto rounded-full bg-bg px-2 py-px text-micro uppercase tracking-wider text-muted">
                  {s.mode}
                </span>
              </span>
              <span className="line-clamp-3 text-xs leading-relaxed text-muted">{s.task}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" onClick={onCompose} className="self-start text-muted">
        <Plus className="size-4" /> Compose from scratch
      </Button>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function NewPulseForm({
  index,
  keysReady,
  defaultSel,
  onCreate,
}: {
  index: CatalogIndex;
  keysReady: (providerId: string) => boolean;
  defaultSel: { providerId: string; modelId: string };
  onCreate: (input: {
    name: string;
    task: string;
    mode: PulseMode;
    providerId: string;
    modelId: string;
    modelName?: string;
    intervalMin: number;
  }) => void;
}) {
  const defaultIdx = useMemo(() => {
    const i = index.featured.findIndex(
      (m) => m.providerId === defaultSel.providerId && m.id === defaultSel.modelId,
    );
    return i === -1 ? 0 : i;
  }, [index.featured, defaultSel]);

  const [name, setName] = useState("");
  const [task, setTask] = useState("");
  const [mode, setMode] = useState<PulseMode>("auto");
  const [modelIdx, setModelIdx] = useState(defaultIdx);
  const [preset, setPreset] = useState<number>(5);
  const [custom, setCustom] = useState("");

  const model = index.featured[modelIdx] ?? index.featured[0];
  const interval = custom.trim() ? Number(custom) : preset;
  const validCustom =
    !custom.trim() || (Number.isFinite(interval) && interval >= MIN_INTERVAL_MIN && interval <= MAX_INTERVAL_MIN);
  const valid = task.trim().length >= 8 && model && validCustom;

  const groups = useMemo(() => {
    const by = new Map<string, { name: string; rows: { idx: number; label: string }[] }>();
    index.featured.forEach((m, idx) => {
      const g = by.get(m.providerId) ?? { name: m.providerName, rows: [] };
      g.rows.push({ idx, label: m.name });
      by.set(m.providerId, g);
    });
    return [...by.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [index.featured]);

  return (
    <form
      className="flex flex-col gap-4 px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onCreate({
          name,
          task,
          mode,
          providerId: model.providerId,
          modelId: model.id,
          modelName: model.name,
          intervalMin: interval,
        });
        setName("");
        setTask("");
        setCustom("");
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-micro uppercase tracking-wider text-subtle">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Morning brief, changelog watch, idea forge…"
          maxLength={60}
          className="h-10 rounded-md bg-bg px-3 text-sm text-fg placeholder:text-subtle shadow-[0_0_0_1px_var(--color-border)] focus:outline-none focus:shadow-[0_0_0_1px_var(--color-border-strong)]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-micro uppercase tracking-wider text-subtle">
          The standing task <span className="normal-case text-muted">(handed over every beat)</span>
        </span>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={4}
          maxLength={MAX_TASK_CHARS}
          placeholder="Every beat: scan the last beat's notes, push the draft one section forward, and log what changed."
          className="resize-none rounded-md bg-bg px-3 py-2 text-sm leading-relaxed text-fg placeholder:text-subtle shadow-[0_0_0_1px_var(--color-border)] focus:outline-none focus:shadow-[0_0_0_1px_var(--color-border-strong)]"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-micro uppercase tracking-wider text-subtle">Who does the work</legend>
          <div className="grid grid-cols-2 gap-2">
            <ModeCard
              on={mode === "auto"}
              onPick={() => setMode("auto")}
              title="By itself"
              blurb="The model does the whole task each beat."
            />
            <ModeCard
              on={mode === "assist"}
              onPick={() => setMode("assist")}
              title="With me"
              blurb="It drafts the fill-out; you take it from there."
            />
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-micro uppercase tracking-wider text-subtle">Model on duty</span>
          <select
            value={modelIdx}
            onChange={(e) => setModelIdx(Number(e.target.value))}
            className="h-10 rounded-md bg-bg px-2 text-sm text-fg shadow-[0_0_0_1px_var(--color-border)] focus:outline-none"
          >
            {groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {g.rows.map((r) => (
                  <option key={r.idx} value={r.idx}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {model && !keysReady(model.providerId) && !model.local ? (
            <span className="text-micro text-danger">
              No key for {model.providerName} yet — beats will error until you add one in Keys.
            </span>
          ) : null}
        </label>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-micro uppercase tracking-wider text-subtle">Every</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {INTERVAL_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setPreset(m);
                setCustom("");
              }}
              className={cn(
                "h-8 rounded-full px-3 text-xs transition-colors duration-150",
                !custom.trim() && preset === m
                  ? "bg-accent text-accent-fg"
                  : "bg-elevated text-muted hover:text-fg",
              )}
            >
              {m}m
            </button>
          ))}
          <span className="mx-1 text-micro text-subtle">or</span>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            placeholder={`${MIN_INTERVAL_MIN}–${MAX_INTERVAL_MIN}`}
            inputMode="numeric"
            className={cn(
              "h-8 w-20 rounded-md bg-bg px-2 text-center text-xs text-fg placeholder:text-subtle focus:outline-none",
              validCustom
                ? "shadow-[0_0_0_1px_var(--color-border)]"
                : "shadow-[0_0_0_1px_var(--color-danger)]",
            )}
          />
          <span className="text-micro text-subtle">min</span>
          <code className="ml-auto rounded-xs bg-bg px-2 py-1 text-micro text-muted">
            {cronFor(validCustom ? interval : preset)}
          </code>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!valid}>
          <HeartPulse className="size-4" /> Start pulse
        </Button>
        <span className="text-micro text-subtle">
          first beat lands in {validCustom ? interval : preset} min
        </span>
      </div>
    </form>
  );
}

function ModeCard({
  on,
  onPick,
  title,
  blurb,
}: {
  on: boolean;
  onPick: () => void;
  title: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={cn(
        "flex flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors duration-150",
        on
          ? "bg-elevated text-fg shadow-[0_0_0_1px_var(--color-border-strong)]"
          : "bg-bg text-muted shadow-[0_0_0_1px_var(--color-border)] hover:text-fg",
      )}
    >
      <span className="text-xs">{title}</span>
      <span className="text-micro leading-snug text-subtle">{blurb}</span>
    </button>
  );
}
