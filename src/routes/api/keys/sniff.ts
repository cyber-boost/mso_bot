import { createFileRoute } from "@tanstack/react-router";
import { loadCatalog } from "@/lib/catalog-load.server";
import { sniffProviders, valueForProvider } from "@/lib/keys/sniff-env.server";

/**
 * Maestro Sniffer — surface provider keys already present on the machine.
 *
 *   GET /api/keys/sniff                -> per-provider detection (masked values only)
 *   GET /api/keys/sniff?activate=<id>  -> raw value for one detected provider
 *
 * The aggregate never returns raw secrets; activation (used after an explicit
 * user click) is the only path that hands the value back to the local browser.
 */
export const Route = createFileRoute("/api/keys/sniff")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const activate = url.searchParams.get("activate")?.trim() ?? "";

        const cat = await loadCatalog();
        const providers = cat.providers.map((p) => p.info);

        if (activate) {
          const p = cat.providers.find((x) => x.info.id === activate);
          if (!p) {
            return Response.json({ error: `Unknown provider ${activate}` }, { status: 404 });
          }
          const det = valueForProvider(providers, activate);
          if (!det) {
            return Response.json(
              { error: `No key detected for ${p.info.name}` },
              { status: 404 },
            );
          }
          return Response.json({ id: activate, name: p.info.name, ...det });
        }

        return Response.json({
          providers: sniffProviders(providers),
          checkedAt: new Date().toISOString(),
        });
      },
    },
  },
});
