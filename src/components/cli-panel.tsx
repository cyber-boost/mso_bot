import { useMemo, useRef, useState } from "react";
import { searchCatalog } from "@/lib/catalog";
import { allHarnesses, LOOP_META, resolveHarness } from "@/lib/harness";
import { useMaestro } from "@/lib/store";
import type { CatalogIndex } from "@/lib/types";
import { formatTokens } from "@/lib/utils";

type Line = { kind: "in" | "out" | "dim"; text: string };

const HELP = `maestro — conduct local and cloud models

  models [query]          search the catalog
  providers [query]       list BYOK providers
  which                   show the current model
  use provider/model      set the conducting model
  harness                 list harnesses
  harness use <id>        wear a harness
  run <prompt>            send a one-shot (opens Chat)
  keys                    open Keys
  help                    this list
  clear                   clear the buffer

Install the Python CLI (stdlib only):

  python3 maestro.py
  python3 maestro.py chat grok-4.5
  python3 maestro.py models grok
  python3 maestro.py config set anthropic "$ANTHROPIC_API_KEY"`;

export function CliPanel({ index }: { index: CatalogIndex }) {
  const {
    selection,
    setSelection,
    setView,
    harnessId,
    customHarnesses,
    setHarnessId,
  } = useMaestro();
  const [lines, setLines] = useState<Line[]>([
    { kind: "dim", text: `maestro ${index.stats.providers} providers · ${index.stats.models.toLocaleString()} models` },
    { kind: "dim", text: "type help  ·  python3 maestro.py" },
  ]);
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const source = useMemo(() => "", []);

  function write(...next: Line[]) {
    setLines((prev) => {
      const out = [...prev, ...next];
      requestAnimationFrame(() => {
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
      return out;
    });
  }

  async function exec(raw: string) {
    const input = raw.trim();
    if (!input) return;
    write({ kind: "in", text: `› ${input}` });
    const [cmd, ...rest] = input.split(/\s+/);
    const arg = rest.join(" ");
    switch (cmd) {
      case "help":
      case "?":
        write({ kind: "out", text: HELP });
        break;
      case "clear":
        setLines([]);
        break;
      case "keys":
        setView("keys");
        write({ kind: "dim", text: "opened Keys" });
        break;
      case "which":
        write({
          kind: "out",
          text: `${selection.providerId}/${selection.modelId}  harness ${harnessId}`,
        });
        break;
      case "harness": {
        const [sub, ...tail] = rest;
        if (sub === "use") {
          const id = tail[0];
          if (!id) {
            write({ kind: "dim", text: "usage: harness use <id>" });
            break;
          }
          const found = allHarnesses(customHarnesses).find(
            (h) => h.id === id || h.name.toLowerCase() === id.toLowerCase(),
          );
          if (!found) {
            write({ kind: "dim", text: `unknown harness: ${id}` });
            break;
          }
          setHarnessId(found.id);
          write({ kind: "out", text: `harness → ${found.id}` });
          break;
        }
        const rows = allHarnesses(customHarnesses)
          .map((h) => {
            const mark = h.id === harnessId ? "*" : " ";
            return `${mark} ${h.id.padEnd(16)} ${LOOP_META[h.loop].label.padEnd(10)} ${h.name}`;
          })
          .join("\n");
        write({ kind: "out", text: rows });
        break;
      }
      case "use": {
        if (!arg.includes("/")) {
          write({ kind: "dim", text: "usage: use provider/model" });
          break;
        }
        const [providerId, modelId] = arg.split("/", 2);
        setSelection({ providerId, modelId });
        write({ kind: "out", text: `default → ${providerId}/${modelId}` });
        break;
      }
      case "run":
        if (!arg) {
          write({ kind: "dim", text: "usage: run <prompt>" });
          break;
        }
        setView("chat");
        write({ kind: "dim", text: "opened Chat — paste the prompt there" });
        break;
      case "providers": {
        const q = arg.toLowerCase();
        const rows = index.providers.filter(
          (p) =>
            !q ||
            p.id.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q),
        );
        write({
          kind: "out",
          text: rows
            .slice(0, 40)
            .map((p) => `${p.id.padEnd(22)} ${p.protocol.padEnd(10)} ${String(p.modelCount).padStart(5)}  ${p.name}`)
            .join("\n") + `\n${Math.min(rows.length, 40)} / ${rows.length}`,
        });
        break;
      }
      case "models": {
        const r = await searchCatalog({ data: { q: arg, chatOnly: true, limit: 30 } });
        write({
          kind: "out",
          text:
            r.results
              .map(
                (m) =>
                  `${`${m.providerId}/${m.id}`.slice(0, 42).padEnd(42)} ${formatTokens(m.context).padStart(6)}  ${m.name}`,
              )
              .join("\n") + `\n${r.results.length} / ${r.total}`,
        });
        break;
      }
      case "version":
        write({ kind: "out", text: "maestro 1.0.0" });
        break;
      default:
        write({ kind: "dim", text: `unknown command: ${cmd}  (try help)` });
    }
  }

  const current = resolveHarness(harnessId, customHarnesses);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r">
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-3xl font-mono text-xs leading-relaxed">
            {lines.map((l, i) => (
              <pre
                key={`${i}-${l.text.slice(0, 12)}`}
                className={
                  l.kind === "in"
                    ? "whitespace-pre-wrap text-fg"
                    : l.kind === "dim"
                      ? "whitespace-pre-wrap text-subtle"
                      : "whitespace-pre-wrap text-muted"
                }
              >
                {l.text}
              </pre>
            ))}
          </div>
        </div>
        <form
          className="border-t border-border px-4 py-3 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            const v = draft;
            setDraft("");
            void exec(v);
          }}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <span className="text-subtle">›</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="models grok"
              suppressHydrationWarning
              className="h-10 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle focus:outline-none"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </form>
      </div>
      <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto p-5 lg:w-80">
        <h2 className="font-display text-xl italic tracking-tight">The Python CLI</h2>
        <p className="text-xs leading-relaxed text-muted">
          One file, no dependencies. Speaks OpenAI Chat Completions and Anthropic
          Messages. Reads models.dev. Talks to Ollama, LM Studio, vLLM, and every
          BYOK cloud listed in the catalog. Harnesses live in this console — wear
          {` ${current.name}`} on Play.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-elevated p-3 text-micro leading-relaxed text-muted">
{`python3 maestro.py
python3 maestro.py models grok
python3 maestro.py chat grok-4.5
python3 maestro.py run ollama/llama3.2 "hi"
python3 maestro.py config set xai "$XAI_API_KEY"`}
        </pre>
        <a
          href="/maestro.py"
          download="maestro.py"
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-xs font-medium text-accent-fg"
        >
          Download maestro.py
        </a>
        <p className="text-micro text-subtle">{source.length ? "" : "stdlib only · Python 3.10+"}</p>
      </aside>
    </div>
  );
}
