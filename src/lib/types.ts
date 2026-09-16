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

/** Detection metadata for a single env var key, returned by the Sniffer. */
export type SniffResult = {
  key: string;
  found: boolean;
  masked: string | null;
  confidence: number;
  source: string | null;
  /** Raw value — only returned on explicit activation, never in the list. */
  value: string | null;
};

/** Per-provider Sniffer result, mirroring the provider's catalog metadata. */
export type ProviderSniff = {
  id: string;
  name: string;
  protocol: string;
  api: string | null;
  env: string[];
  found: string | null;
  result: SniffResult | null;
};

export type SniffIndex = {
  providers: ProviderSniff[];
  checkedAt: string;
};
