import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { getProviderModels } from "@/lib/catalog";
import { useMaestro } from "@/lib/store";
import type { CatalogIndex, ModelRow, ProviderInfo } from "@/lib/types";
import { cn, formatTokens } from "@/lib/utils";
import { ProviderLogo } from "@/components/provider-logo";

export function ModelRail({ index }: { index: CatalogIndex }) {
  const { selection, setSelection, selectedModel } = useMaestro();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [models, setModels] = useState<Record<string, ModelRow[]>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const providers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = index.providers;
    if (!needle) {
      const pin = ["xai", "anthropic", "openai", "openrouter", "groq", "ollama", "lmstudio", "vllm", "llamacpp"];
      const selected = list.find((p) => p.id === selection.providerId);
      const pinned = pin
        .map((id) => list.find((p) => p.id === id))
        .filter((p): p is ProviderInfo => Boolean(p));
      if (selected && !pinned.some((p) => p.id === selected.id)) pinned.push(selected);
      return pinned;
    }
    return list.filter(
      (p) =>
        p.id.toLowerCase().includes(needle) ||
        p.name.toLowerCase().includes(needle),
    );
  }, [index.providers, q, selection.providerId]);

  async function toggle(p: ProviderInfo) {
    if (openId === p.id) {
      setOpenId(null);
      return;
    }
    setOpenId(p.id);
    if (models[p.id] || p.modelCount === 0) return;
    setLoading(p.id);
    try {
      const res = await getProviderModels({ data: { providerId: p.id } });
      if (res) setModels((m) => ({ ...m, [p.id]: res.models.filter((x) => x.chat) }));
    } finally {
      setLoading(null);
    }
  }

  function pick(m: ModelRow) {
    setSelection({ providerId: m.providerId, modelId: m.id }, m);
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-border bg-surface md:w-72 md:border-r">
      <div className="p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Providers"
            suppressHydrationWarning
            className="h-10 w-full rounded-md bg-elevated pl-8 pr-3 text-xs text-fg placeholder:text-subtle focus:outline-none"
          />
        </div>
      </div>
      {!q ? (
        <div className="px-3 pb-2">
          <p className="mb-2 text-micro uppercase tracking-wider text-subtle">On the stand</p>
          <ul className="flex flex-col gap-0.5">
            {index.featured.slice(0, 6).map((m) => {
              const active = selection.providerId === m.providerId && selection.modelId === m.id;
              return (
                <li key={`f-${m.providerId}/${m.id}`}>
                  <button
                    type="button"
                    onClick={() => pick(m)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-xs",
                      active ? "bg-elevated text-fg" : "text-muted hover:text-fg",
                    )}
                  >
                    <ProviderLogo id={m.providerId} name={m.providerName} size="sm" />
                    <span className="min-w-0 truncate">{m.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <p className="mb-1 px-1 text-micro uppercase tracking-wider text-subtle">
          {q ? `${providers.length} matches` : "Ready to conduct"}
        </p>
        {providers.map((p) => {
          const open = openId === p.id;
          const list = models[p.id];
          return (
            <div key={p.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => void toggle(p)}
                className="flex h-10 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-muted hover:text-fg"
              >
                <ProviderLogo id={p.id} name={p.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-fg">{p.name}</span>
                <span className="tabular-nums text-micro text-subtle">{p.modelCount || "local"}</span>
              </button>
              {open ? (
                <div className="mb-2 ml-4 border-l border-border pl-2">
                  {loading === p.id ? (
                    <p className="px-2 py-2 text-micro text-subtle">Loading…</p>
                  ) : (list ?? []).length === 0 ? (
                    <p className="px-2 py-2 text-micro text-subtle">
                      {p.local ? "Discover models from the CLI." : "No chat models."}
                    </p>
                  ) : (
                    (list ?? []).slice(0, 40).map((m) => {
                      const active =
                        selection.providerId === m.providerId && selection.modelId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => pick(m)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-micro",
                            active ? "text-fg" : "text-muted hover:text-fg",
                          )}
                        >
                          <span className="min-w-0 truncate">{m.name}</span>
                          <span className="tabular-nums text-subtle">{formatTokens(m.context)}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {selectedModel ? (
        <p className="hidden" />
      ) : null}
    </aside>
  );
}
