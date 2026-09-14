import { Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { searchCatalog } from "@/lib/catalog";
import { useMaestro } from "@/lib/store";
import type { Protocol } from "@/lib/protocol";
import type { CatalogIndex, ModelRow } from "@/lib/types";
import { cn, formatTokens, formatUsd } from "@/lib/utils";
import { ProviderLogo } from "@/components/provider-logo";

const PROTOCOLS: Array<{ id: Protocol | "any"; label: string }> = [
  { id: "any", label: "All" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
];

export function CatalogPanel({ index }: { index: CatalogIndex }) {
  const { setSelection, setView } = useMaestro();
  const [q, setQ] = useState("");
  const [protocol, setProtocol] = useState<Protocol | "any">("any");
  const [local, setLocal] = useState<"any" | "local" | "cloud">("any");
  const [tools, setTools] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [vision, setVision] = useState(false);
  const [hits, setHits] = useState<ModelRow[]>(index.featured);
  const [total, setTotal] = useState(index.stats.models);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setPending(true);
      void searchCatalog({
        data: {
          q,
          protocol,
          local,
          tools: tools || undefined,
          reasoning: reasoning || undefined,
          vision: vision || undefined,
          chatOnly: true,
          limit: 80,
        },
      })
        .then((r) => {
          setHits(r.results);
          setTotal(r.total);
        })
        .finally(() => setPending(false));
    }, 180);
    return () => clearTimeout(t);
  }, [q, protocol, local, tools, reasoning, vision]);

  function pick(m: ModelRow) {
    setSelection({ providerId: m.providerId, modelId: m.id }, m);
    setView("chat");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search 7,000+ models"
              suppressHydrationWarning
              className="h-11 w-full rounded-lg bg-surface pl-10 pr-4 text-sm text-fg placeholder:text-subtle shadow-[0_0_0_1px_var(--color-border)] focus:shadow-[0_0_0_1px_var(--color-border-strong)] focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {PROTOCOLS.map((p) => (
              <FilterChip
                key={p.id}
                active={protocol === p.id}
                onClick={() => setProtocol(p.id)}
              >
                {p.label}
              </FilterChip>
            ))}
            <FilterChip
              active={local === "local"}
              onClick={() => setLocal(local === "local" ? "any" : "local")}
            >
              Local
            </FilterChip>
            <FilterChip
              active={local === "cloud"}
              onClick={() => setLocal(local === "cloud" ? "any" : "cloud")}
            >
              Cloud
            </FilterChip>
            <FilterChip active={reasoning} onClick={() => setReasoning(!reasoning)}>
              Reasoning
            </FilterChip>
            <FilterChip active={tools} onClick={() => setTools(!tools)}>
              Tools
            </FilterChip>
            <FilterChip active={vision} onClick={() => setVision(!vision)}>
              Vision
            </FilterChip>
          </div>
          <p className="text-micro text-subtle tabular-nums">
            {pending ? "Searching…" : `${total.toLocaleString()} models`}
            {index.source === "live" ? " · live from models.dev" : " · cached catalog"}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-2 sm:grid-cols-2">
          {hits.map((m) => (
            <button
              key={`${m.providerId}/${m.id}`}
              type="button"
              onClick={() => pick(m)}
              className="flex gap-3 rounded-lg bg-surface p-4 text-left shadow-[0_0_0_1px_var(--color-border)] transition-[box-shadow] duration-150 hover:shadow-[0_0_0_1px_var(--color-border-strong)]"
            >
              <ProviderLogo id={m.providerId} name={m.providerName} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm text-fg">{m.name}</span>
                  <span className="shrink-0 text-micro uppercase tracking-wider text-subtle">
                    {m.protocol}
                  </span>
                </span>
                <span className="mt-1 flex flex-wrap gap-x-3 text-micro text-muted">
                  <span className="truncate">{m.providerName}</span>
                  <span className="tabular-nums">{formatTokens(m.context)} ctx</span>
                  <span className="tabular-nums">
                    {formatUsd(m.inputCost)}/{formatUsd(m.outputCost)}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
        {hits.length === 0 && !pending ? (
          <p className="mx-auto max-w-5xl py-16 text-sm text-muted">No models match.</p>
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3 text-xs transition-colors duration-150",
        active ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
