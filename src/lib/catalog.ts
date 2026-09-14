import { createServerFn } from "@tanstack/react-start";
import type { ModelRow, ProviderInfo, SearchQuery, SearchResult } from "./types";

export const getCatalogIndex = createServerFn({ method: "GET" }).handler(async () => {
  const { loadCatalog, toIndex } = await import("./catalog-load.server");
  const cat = await loadCatalog();
  return toIndex(cat, Boolean(process.env.XAI_API_KEY));
});

export const searchCatalog = createServerFn({ method: "POST" })
  .validator((input: SearchQuery) => input)
  .handler(async ({ data }): Promise<SearchResult> => {
    const { loadCatalog, searchLoaded } = await import("./catalog-load.server");
    const cat = await loadCatalog();
    return searchLoaded(cat, data);
  });

export const getProviderModels = createServerFn({ method: "POST" })
  .validator((input: { providerId: string }) => input)
  .handler(
    async ({ data }): Promise<{ provider: ProviderInfo; models: ModelRow[] } | null> => {
      const { loadCatalog } = await import("./catalog-load.server");
      const cat = await loadCatalog();
      const p = cat.providers.find((x) => x.info.id === data.providerId);
      if (!p) return null;
      return { provider: p.info, models: p.models };
    },
  );
