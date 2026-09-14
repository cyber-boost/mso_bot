import { BookOpen, Bot, Keyboard, Library, MessageSquare, Menu, Workflow, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CatalogPanel } from "@/components/catalog-panel";
import { CliPanel } from "@/components/cli-panel";
import { HarnessPanel } from "@/components/harness-panel";
import { KeysPanel } from "@/components/keys-panel";
import { MaestroMark } from "@/components/mark";
import { ModelRail } from "@/components/model-rail";
import { PlayArena } from "@/components/play-arena";
import { PlayPanel } from "@/components/play-panel";
import { ProviderLogo } from "@/components/provider-logo";
import { resolveHarness } from "@/lib/harness";
import { useMaestro, type View } from "@/lib/store";
import type { CatalogIndex, ModelRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV: { id: View; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "harness", label: "Harness", icon: Workflow },
  { id: "catalog", label: "Catalog", icon: Library },
  { id: "keys", label: "Keys", icon: Keyboard },
  { id: "cli", label: "CLI", icon: BookOpen },
  { id: "play", label: "Play", icon: Bot },
];

export function Console({ index }: { index: CatalogIndex }) {
  const {
    view,
    setView,
    selection,
    selectedModel,
    setSelectedModel,
    hydrate,
    hydrated,
    harnessId,
    customHarnesses,
  } = useMaestro();
  const [railOpen, setRailOpen] = useState(false);
  const harness = resolveHarness(harnessId, customHarnesses);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const provider = useMemo(
    () => index.providers.find((p) => p.id === selection.providerId),
    [index.providers, selection.providerId],
  );

  const model: ModelRow | null = useMemo(() => {
    if (
      selectedModel &&
      selectedModel.providerId === selection.providerId &&
      selectedModel.id === selection.modelId
    ) {
      return selectedModel;
    }
    return (
      index.featured.find(
        (m) => m.providerId === selection.providerId && m.id === selection.modelId,
      ) ?? null
    );
  }, [selectedModel, selection, index.featured]);

  useEffect(() => {
    if (model && !selectedModel) setSelectedModel(model);
  }, [model, selectedModel, setSelectedModel]);

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-4">
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-md text-fg md:hidden"
          aria-label={railOpen ? "Close models" : "Open models"}
          onClick={() => setRailOpen((v) => !v)}
        >
          {railOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
        <div className="flex items-center gap-2">
          <MaestroMark className="size-6" />
          <span className="font-display text-xl italic tracking-tight">Maestro</span>
        </div>
        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setView(n.id)}
              className={cn(
                "h-8 rounded-full px-3 text-xs transition-colors duration-150",
                view === n.id ? "bg-elevated text-fg" : "text-muted hover:text-fg",
              )}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => {
            setView("chat");
            setRailOpen(true);
          }}
          className="ml-auto flex min-w-0 max-w-[55%] items-center gap-2 rounded-full bg-elevated px-2.5 py-1.5 text-left sm:max-w-xs"
        >
          {provider ? (
            <ProviderLogo id={provider.id} name={provider.name} size="sm" />
          ) : null}
          <span className="min-w-0 truncate text-xs text-fg">
            {model?.name ?? selection.modelId}
          </span>
          <span className="hidden text-micro tracking-wide text-subtle sm:inline">
            {harness.name}
          </span>
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div
          className={cn(
            "z-20 flex shrink-0 flex-col bg-surface md:relative md:flex md:w-72",
            view === "chat" ? "md:flex" : "md:hidden",
            railOpen
              ? "absolute inset-y-0 left-0 w-[min(100%,18rem)] shadow-[0_0_0_1px_var(--color-border)]"
              : "hidden md:flex",
            view !== "chat" && !railOpen ? "md:hidden hidden" : "",
          )}
        >
          <ModelRail index={index} />
        </div>
        {railOpen ? (
          <button
            type="button"
            className="absolute inset-0 z-10 bg-bg/60 md:hidden"
            aria-label="Close models"
            onClick={() => setRailOpen(false)}
          />
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view === "chat" ? (
            <PlayPanel index={index} model={model} provider={provider} />
          ) : null}
          {view === "harness" ? <HarnessPanel /> : null}
          {view === "catalog" ? <CatalogPanel index={index} /> : null}
          {view === "keys" ? <KeysPanel index={index} /> : null}
          {view === "cli" ? <CliPanel index={index} /> : null}
          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 flex-col",
              view === "play" ? "flex" : "hidden",
            )}
          >
            <PlayArena index={index} active={view === "play"} />
          </div>
        </main>
      </div>

      <nav
        className="flex h-14 shrink-0 items-stretch border-t border-border md:hidden"
        aria-label="Mobile"
      >
        {NAV.map((n) => {
          const Icon = n.icon;
          const on = view === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                setView(n.id);
                setRailOpen(false);
              }}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-micro",
                on ? "text-fg" : "text-subtle",
              )}
            >
              <Icon className="size-4" />
              {n.label}
            </button>
          );
        })}
      </nav>
      {hydrated ? null : null}
    </div>
  );
}
