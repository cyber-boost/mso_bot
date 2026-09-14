import type { Protocol } from "./protocol";

export type ProviderInfo = {
  id: string;
  name: string;
  npm: string | null;
  api: string | null;
  env: string[];
  doc: string | null;
  protocol: Protocol;
  local: boolean;
  modelCount: number;
};

export type ModelRow = {
  providerId: string;
  providerName: string;
  protocol: Protocol;
  local: boolean;
  id: string;
  name: string;
  family: string | null;
  attachment: boolean;
  reasoning: boolean;
  toolCall: boolean;
  structured: boolean;
  temperature: boolean;
  openWeights: boolean;
  context: number | null;
  output: number | null;
  inputCost: number | null;
  outputCost: number | null;
  inputMods: string[];
  outputMods: string[];
  chat: boolean;
};

export type CatalogIndex = {
  fetchedAt: string;
  source: "live" | "cache";
  stats: { providers: number; models: number; local: number };
  xaiReady: boolean;
  providers: ProviderInfo[];
  featured: ModelRow[];
};

export type SearchQuery = {
  q?: string;
  providerId?: string;
  protocol?: Protocol | "any";
  local?: "any" | "local" | "cloud";
  reasoning?: boolean;
  tools?: boolean;
  vision?: boolean;
  openWeights?: boolean;
  chatOnly?: boolean;
  limit?: number;
};

export type SearchResult = {
  total: number;
  results: ModelRow[];
};

export type Selection = {
  providerId: string;
  modelId: string;
};
