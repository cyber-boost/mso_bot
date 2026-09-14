import { createFileRoute } from "@tanstack/react-router";
import { Console } from "@/components/console";
import { getCatalogIndex } from "@/lib/catalog";

export const Route = createFileRoute("/")({
  loader: () => getCatalogIndex(),
  pendingComponent: Boot,
  errorComponent: ({ error }) => (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <p className="font-display text-2xl italic">Catalog unreachable</p>
      <p className="max-w-md text-sm text-muted">
        {error instanceof Error ? error.message : "Could not load models.dev."}
      </p>
    </main>
  ),
  component: Home,
});

function Home() {
  const index = Route.useLoaderData();
  return <Console index={index} />;
}

function Boot() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg text-fg">
      <p className="font-display text-3xl italic tracking-tight">Maestro</p>
      <p className="mt-3 text-xs text-subtle">tuning the orchestra…</p>
    </main>
  );
}
