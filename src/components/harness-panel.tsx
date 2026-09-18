import { ArrowLeft, Copy, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { McpSection } from "@/components/mcp-section";
import { Button } from "@/components/ui/button";
import {
  blankHarness,
  BUILTINS,
  forkHarness,
  LOOP_META,
  resolveHarness,
  TOOL_META,
  workflowPreview,
  type Harness,
  type LoopKind,
  type Stage,
  type ToolId,
} from "@/lib/harness";
import { useMaestro } from "@/lib/store";
import { cn } from "@/lib/utils";

export function HarnessPanel() {
  const {
    harnessId,
    setHarnessId,
    customHarnesses,
    upsertHarness,
    deleteHarness,
    setView,
  } = useMaestro();
  const [editingId, setEditingId] = useState<string | null>(null);
  const active = resolveHarness(harnessId, customHarnesses);
  const editing = editingId
    ? customHarnesses.find((h) => h.id === editingId) ?? null
    : null;

  function select(h: Harness) {
    setHarnessId(h.id);
  }

  function fork(src: Harness) {
    const next = forkHarness(src, crypto.randomUUID());
    upsertHarness(next);
    setHarnessId(next.id);
    setEditingId(next.id);
  }

  function create() {
    const next = blankHarness(crypto.randomUUID());
    upsertHarness(next);
    setHarnessId(next.id);
    setEditingId(next.id);
  }

  if (editing) {
    return (
      <Editor
        harness={editing}
        onChange={(h) => upsertHarness(h)}
        onBack={() => setEditingId(null)}
        onDelete={() => {
          deleteHarness(editing.id);
          setEditingId(null);
        }}
        onPlay={() => setView("chat")}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h2 className="font-display text-3xl italic tracking-tight">The harness</h2>
          <p className="max-w-lg text-sm leading-relaxed text-muted">
            The model is the instrument. The harness is how it moves — a default
            Open pass, a Claude Code-shaped agent, or a short workflow. Not a
            framework.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={create}>
              <Plus className="size-3.5" />
              New
            </Button>
            <Button size="sm" variant="outline" onClick={() => fork(active)}>
              <Copy className="size-3.5" />
              Fork {active.name}
            </Button>
          </div>
        </header>

        <McpSection />

        <section>
          <p className="mb-3 text-micro uppercase tracking-wider text-subtle">On the stand</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {BUILTINS.map((h) => (
              <li key={h.id}>
                <HarnessCard
                  harness={h}
                  active={h.id === harnessId}
                  onSelect={() => select(h)}
                  onFork={() => fork(h)}
                />
              </li>
            ))}
          </ul>
        </section>

        {customHarnesses.length > 0 ? (
          <section>
            <p className="mb-3 text-micro uppercase tracking-wider text-subtle">Yours</p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {customHarnesses.map((h) => (
                <li key={h.id}>
                  <HarnessCard
                    harness={h}
                    active={h.id === harnessId}
                    onSelect={() => select(h)}
                    onEdit={() => setEditingId(h.id)}
                    onFork={() => fork(h)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ActiveStrip harness={active} onPlay={() => setView("chat")} />
      </div>
    </div>
  );
}

function HarnessCard({
  harness,
  active,
  onSelect,
  onEdit,
  onFork,
}: {
  harness: Harness;
  active: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onFork: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg bg-surface p-4 shadow-[0_0_0_1px_var(--color-border)]",
        active && "shadow-[0_0_0_1px_var(--color-border-strong)]",
      )}
    >
      <button type="button" onClick={onSelect} className="text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-xl italic tracking-tight text-fg">
            {harness.name}
          </span>
          <span className="text-micro uppercase tracking-wider text-subtle">
            {LOOP_META[harness.loop].label}
            {active ? " · on" : ""}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">{harness.blurb}</p>
        <Staff harness={harness} />
      </button>
      <div className="mt-3 flex gap-3 text-micro text-subtle">
        {onEdit ? (
          <button type="button" className="hover:text-fg" onClick={onEdit}>
            Tune
          </button>
        ) : (
          <button type="button" className="hover:text-fg" onClick={onFork}>
            Fork
          </button>
        )}
        {onEdit ? (
          <button type="button" className="hover:text-fg" onClick={onFork}>
            Duplicate
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Staff({ harness }: { harness: Harness }) {
  const nodes =
    harness.loop === "pipeline" && harness.stages.length
      ? harness.stages.map((s) => s.name)
      : harness.loop === "react"
        ? ["think", "tool", "answer"]
        : ["reply"];
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-micro uppercase tracking-wider text-subtle">
      {nodes.map((n, i) => (
        <li key={`${n}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <span className="text-subtle">—</span> : null}
          <span>{n}</span>
        </li>
      ))}
    </ol>
  );
}

function ActiveStrip({ harness, onPlay }: { harness: Harness; onPlay: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-elevated px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-micro uppercase tracking-wider text-subtle">Conducting with</p>
        <p className="font-display text-2xl italic tracking-tight">{harness.name}</p>
        <p className="mt-1 text-xs text-muted">{LOOP_META[harness.loop].blurb}</p>
      </div>
      <Button onClick={onPlay}>Chat</Button>
    </div>
  );
}

function Editor({
  harness,
  onChange,
  onBack,
  onDelete,
  onPlay,
}: {
  harness: Harness;
  onChange: (h: Harness) => void;
  onBack: () => void;
  onDelete: () => void;
  onPlay: () => void;
}) {
  const preview = useMemo(() => workflowPreview(harness), [harness]);

  function patch(p: Partial<Harness>) {
    onChange({ ...harness, ...p });
  }

  function setLoop(loop: LoopKind) {
    if (loop === harness.loop) return;
    const next: Partial<Harness> = { loop };
    if (loop === "react" && harness.tools.length === 0) {
      next.tools = ["catalog", "reflect"];
      next.maxSteps = harness.maxSteps || 4;
    }
    if (loop === "pipeline" && harness.stages.length === 0) {
      next.stages = [
        { id: crypto.randomUUID(), name: "Plan", instructions: "" },
        { id: crypto.randomUUID(), name: "Do", instructions: "" },
      ];
    }
    patch(next);
  }

  function toggleTool(id: ToolId) {
    patch({
      tools: harness.tools.includes(id)
        ? harness.tools.filter((t) => t !== id)
        : [...harness.tools, id],
    });
  }

  function patchStage(id: string, p: Partial<Stage>) {
    patch({
      stages: harness.stages.map((s) => (s.id === id ? { ...s, ...p } : s)),
    });
  }

  function addStage() {
    if (harness.stages.length >= 5) return;
    patch({
      stages: [
        ...harness.stages,
        { id: crypto.randomUUID(), name: "Step", instructions: "" },
      ],
    });
  }

  function removeStage(id: string) {
    patch({ stages: harness.stages.filter((s) => s.id !== id) });
  }

  function moveStage(id: string, dir: -1 | 1) {
    const i = harness.stages.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= harness.stages.length) return;
    const stages = harness.stages.slice();
    const [row] = stages.splice(i, 1);
    stages.splice(j, 0, row);
    patch({ stages });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md text-muted hover:text-fg"
            aria-label="Back"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
          </button>
          <h2 className="font-display text-2xl italic tracking-tight">Tune</h2>
          <button
            type="button"
            className="ml-auto inline-flex size-10 items-center justify-center rounded-md text-muted hover:text-danger"
            aria-label="Delete harness"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-micro uppercase tracking-wider text-subtle">Name</span>
          <input
            value={harness.name}
            onChange={(e) => patch({ name: e.target.value.slice(0, 40) })}
            suppressHydrationWarning
            className="h-11 rounded-lg bg-surface px-4 font-display text-lg italic text-fg shadow-[0_0_0_1px_var(--color-border)] focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-micro uppercase tracking-wider text-subtle">Blurb</span>
          <input
            value={harness.blurb}
            onChange={(e) => patch({ blurb: e.target.value.slice(0, 120) })}
            suppressHydrationWarning
            className="h-11 rounded-lg bg-surface px-4 text-sm text-fg shadow-[0_0_0_1px_var(--color-border)] focus:outline-none"
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-micro uppercase tracking-wider text-subtle">Loop</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(LOOP_META) as LoopKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setLoop(k)}
                className={cn(
                  "h-10 rounded-full px-4 text-xs",
                  harness.loop === k
                    ? "bg-accent text-accent-fg"
                    : "bg-surface text-muted shadow-[0_0_0_1px_var(--color-border)] hover:text-fg",
                )}
              >
                {LOOP_META[k].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{LOOP_META[harness.loop].blurb}</p>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-micro uppercase tracking-wider text-subtle">Instructions</span>
          <textarea
            value={harness.instructions}
            onChange={(e) => patch({ instructions: e.target.value.slice(0, 4000) })}
            rows={8}
            placeholder="Who it is. What it will not do."
            suppressHydrationWarning
            className="resize-y rounded-lg bg-surface px-4 py-3 text-sm leading-relaxed text-fg shadow-[0_0_0_1px_var(--color-border)] placeholder:text-subtle focus:outline-none"
          />
        </label>

        {harness.loop === "react" ? (
          <>
            <fieldset>
              <legend className="mb-2 text-micro uppercase tracking-wider text-subtle">
                Tools
              </legend>
              <ul className="flex flex-col gap-1">
                {TOOL_META.map((t) => {
                  const on = harness.tools.includes(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => toggleTool(t.id)}
                        className={cn(
                          "flex w-full items-baseline justify-between gap-3 rounded-md px-3 py-2.5 text-left",
                          on ? "bg-elevated text-fg" : "text-muted hover:text-fg",
                        )}
                      >
                        <span className="text-xs">{t.name}</span>
                        <span className="text-micro text-subtle">{t.blurb}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <label className="flex items-center justify-between gap-3">
              <span className="text-micro uppercase tracking-wider text-subtle">
                Max steps
              </span>
              <input
                type="number"
                min={1}
                max={6}
                value={harness.maxSteps}
                onChange={(e) =>
                  patch({ maxSteps: Math.min(6, Math.max(1, Number(e.target.value) || 1)) })
                }
                suppressHydrationWarning
                className="h-10 w-20 rounded-md bg-surface px-3 text-sm text-fg shadow-[0_0_0_1px_var(--color-border)] focus:outline-none"
              />
            </label>
          </>
        ) : null}

        {harness.loop === "pipeline" ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <p className="text-micro uppercase tracking-wider text-subtle">Steps</p>
              <button
                type="button"
                className="text-micro text-muted hover:text-fg disabled:opacity-40"
                disabled={harness.stages.length >= 5}
                onClick={addStage}
              >
                Add step
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {harness.stages.map((s, i) => (
                <li
                  key={s.id}
                  className="rounded-lg bg-surface p-3 shadow-[0_0_0_1px_var(--color-border)]"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="w-4 text-micro tabular-nums text-subtle">{i + 1}</span>
                    <input
                      value={s.name}
                      onChange={(e) => patchStage(s.id, { name: e.target.value.slice(0, 24) })}
                      suppressHydrationWarning
                      className="h-9 flex-1 bg-transparent text-sm text-fg focus:outline-none"
                    />
                    <button
                      type="button"
                      className="text-micro text-subtle hover:text-fg disabled:opacity-30"
                      disabled={i === 0}
                      onClick={() => moveStage(s.id, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="text-micro text-subtle hover:text-fg disabled:opacity-30"
                      disabled={i === harness.stages.length - 1}
                      onClick={() => moveStage(s.id, 1)}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className="text-micro text-subtle hover:text-danger"
                      onClick={() => removeStage(s.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    value={s.instructions}
                    onChange={(e) =>
                      patchStage(s.id, { instructions: e.target.value.slice(0, 2000) })
                    }
                    rows={3}
                    placeholder="What this step does. Nothing else."
                    suppressHydrationWarning
                    className="w-full resize-y bg-transparent px-1 text-xs leading-relaxed text-muted placeholder:text-subtle focus:outline-none"
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <pre className="overflow-x-auto rounded-lg bg-elevated p-3 text-micro leading-relaxed text-muted">
          {preview}
        </pre>

        <div className="flex flex-wrap gap-2 pb-8">
          <Button onClick={onPlay}>Chat</Button>
          <Button variant="outline" onClick={onBack}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
