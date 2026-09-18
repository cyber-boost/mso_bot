import { ArrowUp, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  compileSystem,
  LOOP_META,
  resolveHarness,
  startersFor,
  type TraceEvent,
} from "@/lib/harness";
import {
  anthropicBody,
  chatPath,
  openaiBody,
  protocolOf,
  resolveBaseUrl,
  type ChatMessage,
} from "@/lib/protocol";
import { runWithHarness } from "@/lib/run-harness";
import { useShell } from "@/lib/shell-store";
import { useMaestro } from "@/lib/store";
import type { CatalogIndex, ModelRow, ProviderInfo } from "@/lib/types";
import { cn, formatTokens, formatUsd } from "@/lib/utils";

export function PlayPanel({
  index,
  model,
  provider,
}: {
  index: CatalogIndex;
  model: ModelRow | null;
  provider: ProviderInfo | undefined;
}) {
  const {
    selection,
    messages,
    append,
    patchLast,
    clearMessages,
    keys,
    systemPrompt,
    setSystemPrompt,
    temperature,
    maxTokens,
    inspectorOpen,
    setInspectorOpen,
    harnessId,
    customHarnesses,
    setView,
  } = useMaestro();
  const harness = resolveHarness(harnessId, customHarnesses);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scratchRef = useRef<Record<string, string>>({});
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const protocol = provider?.protocol ?? protocolOf(provider?.npm);
  const base = provider ? resolveBaseUrl(provider.id, provider.api) : null;
  const ready =
    Boolean(keys[selection.providerId]) ||
    (selection.providerId === "xai" && index.xaiReady);
  const local = Boolean(provider?.local);
  const compiled = compileSystem(harness, systemPrompt);

  const payload = useMemo(() => {
    const msgs: ChatMessage[] = [];
    if (compiled) msgs.push({ role: "system", content: compiled });
    for (const m of messages) msgs.push({ role: m.role, content: m.content });
    if (protocol === "anthropic") {
      return anthropicBody(selection.modelId, msgs, {
        stream: true,
        temperature: harness.temperature ?? temperature,
        maxTokens: harness.maxTokens ?? maxTokens,
      });
    }
    return openaiBody(selection.modelId, msgs, {
      stream: true,
      temperature: harness.temperature ?? temperature,
      maxTokens: harness.maxTokens ?? maxTokens,
    });
  }, [
    messages,
    compiled,
    protocol,
    selection.modelId,
    temperature,
    maxTokens,
    harness.temperature,
    harness.maxTokens,
  ]);

  useEffect(() => {
    scratchRef.current = {};
  }, [harnessId]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, live]);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    if (local) {
      setError("Local models are reached from the Python CLI on your machine.");
      return;
    }
    if (!ready) {
      setError(`Add a key for ${provider?.name ?? selection.providerId} in Keys.`);
      return;
    }
    setError(null);
    setDraft("");
    setLive("");
    const userId = crypto.randomUUID();
    const asstId = crypto.randomUUID();
    append({ id: userId, role: "user", content: prompt });
    append({ id: asstId, role: "assistant", content: "", traces: [] });
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const snapshot = useMaestro.getState().messages;
    const history: ChatMessage[] = [];
    for (const m of snapshot) {
      if (m.id === asstId) continue;
      history.push({ role: m.role, content: m.content });
    }
    let traces: TraceEvent[] = [];
    try {
      await runWithHarness(
        {
          harness,
          overlay: systemPrompt,
          history,
          providerId: selection.providerId,
          modelId: selection.modelId,
          temperature,
          maxTokens,
          apiKey: keys[selection.providerId] || undefined,
          ctx: {
            providerId: selection.providerId,
            modelId: selection.modelId,
            scratch: scratchRef.current,
          },
        },
        {
          onText: (acc) => {
            setLive(acc);
            patchLast(acc, traces);
          },
          onTraces: (next) => {
            traces = next;
            const last = useMaestro.getState().messages.at(-1);
            patchLast(last?.content ?? "", traces);
          },
          signal: ac.signal,
        },
      );
      useShell.getState().award("chat", 10);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "Chat failed";
      setError(msg);
    } finally {
      setBusy(false);
      abortRef.current = null;
      box.current?.focus();
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 ? (
          <EmptyPlay
            model={model}
            selection={selection}
            protocol={protocol}
            harnessName={harness.name}
            harnessBlurb={harness.blurb}
            loopLabel={LOOP_META[harness.loop].label}
            starters={startersFor(harness)}
            onPick={(s) => void send(s)}
            onHarness={() => setView("harness")}
          />
        ) : (
          <ol className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((m) => (
              <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[min(100%,42rem)] rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user" ? "bg-elevated text-fg" : "text-fg",
                  )}
                >
                  {m.role === "assistant" && (
                    <div className="mb-2 text-micro uppercase tracking-wider text-subtle">
                      {model?.name ?? selection.modelId}
                      <span className="text-subtle"> · {harness.name}</span>
                    </div>
                  )}
                  {m.role === "assistant" && m.traces?.length ? (
                    <ol className="mb-3 flex flex-col gap-1">
                      {m.traces.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-baseline gap-2 text-micro uppercase tracking-wider text-subtle"
                        >
                          <span>{t.label}</span>
                          {t.detail ? (
                            <span className="normal-case tracking-normal text-muted">
                              {t.detail}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {m.role === "assistant" && m.id === messages.at(-1)?.id
                    ? live || m.content
                    : m.content}
                  {busy && m.role === "assistant" && m.id === messages.at(-1)?.id && !live ? (
                    <span className="maestro-shimmer text-muted">conducting</span>
                  ) : null}
                  {busy && m.role === "assistant" && m.id === messages.at(-1)?.id ? (
                    <span className="maestro-caret" />
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="border-t border-border px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {error ? (
            <p className="mb-2 text-xs text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-end gap-2 rounded-xl bg-surface p-2 shadow-[0_0_0_1px_var(--color-border)]">
            <textarea
              ref={box}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              suppressHydrationWarning
              placeholder={
                local
                  ? "Use the CLI for local models"
                  : ready
                    ? "Message, or Shift+Enter for a newline"
                    : "Add a provider key to conduct"
              }
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-fg placeholder:text-subtle focus:outline-none"
            />
            {busy ? (
              <Button
                size="icon"
                variant="outline"
                aria-label="Stop"
                onClick={() => abortRef.current?.abort()}
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                aria-label="Send"
                disabled={!draft.trim()}
                onClick={() => void send(draft)}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-subtle">
            <span className="font-medium text-muted">
              $ maestro chat {selection.providerId}/{selection.modelId}
            </span>
            <button
              type="button"
              className="text-muted hover:text-fg"
              onClick={() => setView("harness")}
            >
              {harness.name}
            </button>
            <span className="uppercase tracking-wider">{LOOP_META[harness.loop].label}</span>
            {model?.context ? <span>{formatTokens(model.context)} ctx</span> : null}
            {model?.inputCost != null ? (
              <span>
                {formatUsd(model.inputCost)} / {formatUsd(model.outputCost)} per 1M
              </span>
            ) : null}
            <button
              type="button"
              className="ml-auto text-muted hover:text-fg"
              onClick={() => setInspectorOpen(!inspectorOpen)}
            >
              {inspectorOpen ? "Hide request" : "Show request"}
            </button>
            {messages.length > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-muted hover:text-fg"
                onClick={() => clearMessages()}
              >
                <Trash2 className="size-3" />
                Clear
              </button>
            ) : null}
          </div>
          {inspectorOpen ? (
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-micro uppercase tracking-wider text-subtle">
                  Session note
                </span>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value.slice(0, 2000))}
                  rows={3}
                  placeholder="Optional overlay on top of the harness."
                  suppressHydrationWarning
                  className="rounded-lg bg-elevated px-3 py-2 text-xs leading-relaxed text-fg placeholder:text-subtle focus:outline-none"
                />
              </label>
              <pre className="max-h-56 overflow-auto rounded-lg bg-elevated p-3 text-micro leading-relaxed text-muted">
                {`POST ${base ?? "…"}${chatPath(protocol)}\n${JSON.stringify(payload, null, 2)}`}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyPlay({
  model,
  selection,
  protocol,
  harnessName,
  harnessBlurb,
  loopLabel,
  starters,
  onPick,
  onHarness,
}: {
  model: ModelRow | null;
  selection: { providerId: string; modelId: string };
  protocol: string;
  harnessName: string;
  harnessBlurb: string;
  loopLabel: string;
  starters: string[];
  onPick: (s: string) => void;
  onHarness: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-6 pt-8 sm:pt-16">
      <p className="font-display text-3xl leading-tight tracking-tight text-fg italic">
        The orchestra is tuned.
      </p>
      <p className="max-w-md text-sm leading-relaxed text-muted">
        {model?.name ?? selection.modelId} via the {protocol} protocol, wearing{" "}
        <button type="button" className="text-fg hover:underline" onClick={onHarness}>
          {harnessName}
        </button>
        . {harnessBlurb}
      </p>
      <p className="text-micro uppercase tracking-wider text-subtle">{loopLabel} loop</p>
      <ul className="flex w-full flex-col gap-2">
        {starters.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="w-full rounded-lg bg-surface px-4 py-3 text-left text-xs leading-relaxed text-muted shadow-[0_0_0_1px_var(--color-border)] transition-colors duration-150 hover:text-fg"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
