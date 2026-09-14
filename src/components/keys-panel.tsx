import { useState } from "react";
import { resolveBaseUrl } from "@/lib/protocol";
import { useMaestro } from "@/lib/store";
import type { CatalogIndex } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ProviderLogo } from "@/components/provider-logo";

const PINNED = ["xai", "anthropic", "openai", "openrouter", "groq", "ollama", "lmstudio", "vllm"];

export function KeysPanel({ index }: { index: CatalogIndex }) {
  const { keys, setKey, clearKey } = useMaestro();
  const [filter, setFilter] = useState("");
  const q = filter.toLowerCase();
  const providers = [...index.providers].sort((a, b) => {
    const ap = PINNED.indexOf(a.id);
    const bp = PINNED.indexOf(b.id);
    if (ap !== bp) {
      if (ap === -1) return 1;
      if (bp === -1) return -1;
      return ap - bp;
    }
    return a.name.localeCompare(b.name);
  }).filter((p) => {
    if (!q) return PINNED.includes(p.id) || Boolean(keys[p.id]);
    return (
      p.id.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.env.some((e) => e.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h2 className="font-display text-2xl italic tracking-tight">Bring your own key</h2>
          <p className="text-sm leading-relaxed text-muted">
            Keys stay in this browser. They ride with each request to the matching
            OpenAI or Anthropic endpoint and are never written on the server.
            xAI is already wired for this console.
          </p>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a provider"
            suppressHydrationWarning
            className="mt-2 h-11 rounded-lg bg-surface px-4 text-sm text-fg placeholder:text-subtle shadow-[0_0_0_1px_var(--color-border)] focus:outline-none"
          />
        </header>
        <ul className="flex flex-col gap-2">
          {providers.map((p) => {
            const env = p.env[0] ?? `${p.id.toUpperCase()}_API_KEY`;
            const have = Boolean(keys[p.id]) || (p.id === "xai" && index.xaiReady);
            const base = resolveBaseUrl(p.id, p.api);
            return (
              <li
                key={p.id}
                className="rounded-lg bg-surface p-4 shadow-[0_0_0_1px_var(--color-border)]"
              >
                <div className="flex items-start gap-3">
                  <ProviderLogo id={p.id} name={p.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-sm text-fg">{p.name}</div>
                      <div className="text-micro uppercase tracking-wider text-subtle">
                        {p.protocol}
                        {have ? " · ready" : ""}
                        {p.local ? " · local" : ""}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-micro text-muted">
                      {env}
                      {base ? `  ·  ${base}` : ""}
                    </div>
                    {p.id === "xai" && index.xaiReady && !keys[p.id] ? (
                      <p className="mt-3 text-xs text-ok">Platform key available — no paste needed.</p>
                    ) : (
                      <KeyRow
                        have={Boolean(keys[p.id])}
                        onSave={(v) => setKey(p.id, v)}
                        onClear={() => clearKey(p.id)}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function KeyRow({
  have,
  onSave,
  onClear,
}: {
  have: boolean;
  onSave: (v: string) => void;
  onClear: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="mt-3 flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          onSave(value.trim());
          setValue("");
        }
      }}
    >
      <input
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={have ? "Replace key" : "Paste API key"}
        suppressHydrationWarning
        className="h-10 min-w-0 flex-1 rounded-md bg-elevated px-3 text-xs text-fg placeholder:text-subtle focus:outline-none"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!value.trim()}>
          Save
        </Button>
        {have ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            Remove
          </Button>
        ) : null}
      </div>
    </form>
  );
}
