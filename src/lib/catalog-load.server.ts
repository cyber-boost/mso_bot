import {
  isChatModel,
  isLocalApi,
  protocolOf,
  SYNTHETIC_LOCAL,
} from "./protocol";
import type {
  CatalogIndex,
  ModelRow,
  ProviderInfo,
  SearchQuery,
  SearchResult,
} from "./types";

const CATALOG_URL = "https://models.dev/api.json";
const TTL_MS = 60 * 60 * 1000;

type RawModel = {
  id?: string;
  name?: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  open_weights?: boolean;
  limit?: { context?: number; output?: number };
  cost?: { input?: number; output?: number };
  modalities?: { input?: string[]; output?: string[] };
};

type RawProvider = {
  id?: string;
  name?: string;
  npm?: string;
  api?: string;
  env?: string[];
  doc?: string;
  models?: Record<string, RawModel>;
};

export type SlimProvider = {
  info: ProviderInfo;
  models: ModelRow[];
};

type Cache = {
  at: number;
  source: "live" | "cache";
  providers: SlimProvider[];
};

let cache: Cache | null = null;
let inflight: Promise<Cache> | null = null;

function rowFrom(info: ProviderInfo, mid: string, m: RawModel): ModelRow {
  const inputMods = m.modalities?.input ?? ["text"];
  const outputMods = m.modalities?.output ?? ["text"];
  return {
    providerId: info.id,
    providerName: info.name,
    protocol: info.protocol,
    local: info.local,
    id: m.id || mid,
    name: m.name || mid,
    family: m.family ?? null,
    attachment: Boolean(m.attachment),
    reasoning: Boolean(m.reasoning),
    toolCall: Boolean(m.tool_call),
    structured: Boolean(m.structured_output),
    temperature: Boolean(m.temperature),
    openWeights: Boolean(m.open_weights),
    context: m.limit?.context ?? null,
    output: m.limit?.output ?? null,
    inputCost: m.cost?.input ?? null,
    outputCost: m.cost?.output ?? null,
    inputMods,
    outputMods,
    chat: isChatModel(outputMods),
  };
}

function syntheticProviders(): SlimProvider[] {
  return Object.entries(SYNTHETIC_LOCAL).map(([id, spec]) => {
    const info: ProviderInfo = {
      id,
      name: spec.name,
      npm: "@ai-sdk/openai-compatible",
      api: spec.api,
      env: spec.env,
      doc: null,
      protocol: "openai",
      local: true,
      modelCount: 0,
    };
    return { info, models: [] };
  });
}

async function fetchLive(): Promise<Record<string, RawProvider>> {
  const res = await fetch(CATALOG_URL, {
    headers: { Accept: "application/json", "User-Agent": "Maestro/1.0" },
  });
  if (!res.ok) throw new Error(`models.dev ${res.status}`);
  return (await res.json()) as Record<string, RawProvider>;
}

function slim(raw: Record<string, RawProvider>): SlimProvider[] {
  const out: SlimProvider[] = [];
  for (const [pid, p] of Object.entries(raw)) {
    const id = p.id || pid;
    const api = p.api ?? null;
    const npm = p.npm ?? null;
    const info: ProviderInfo = {
      id,
      name: p.name || id,
      npm,
      api,
      env: p.env ?? [],
      doc: p.doc ?? null,
      protocol: protocolOf(npm),
      local: isLocalApi(api),
      modelCount: 0,
    };
    const models: ModelRow[] = [];
    for (const [mid, m] of Object.entries(p.models ?? {})) {
      models.push(rowFrom(info, mid, m));
    }
    info.modelCount = models.length;
    out.push({ info, models });
  }
  const have = new Set(out.map((p) => p.info.id));
  for (const syn of syntheticProviders()) {
    if (!have.has(syn.info.id)) out.push(syn);
  }
  out.sort((a, b) => a.info.name.localeCompare(b.info.name));
  return out;
}

export async function loadCatalog(): Promise<Cache> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const raw = await fetchLive();
      cache = { at: Date.now(), source: "live", providers: slim(raw) };
      return cache;
    } catch (err) {
      if (cache) return cache;
      throw err;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

const FEATURED: Array<[string, string]> = [
  ["xai", "grok-4.5"],
  ["xai", "grok-4.6"],
  ["xai", "grok-4.3"],
  ["anthropic", "claude-sonnet-4-6"],
  ["anthropic", "claude-opus-4-6"],
  ["openai", "gpt-5.4"],
  ["openai", "gpt-6-astra"],
  ["groq", "llama-3.3-70b-versatile"],
];

export function pickFeatured(providers: SlimProvider[]): ModelRow[] {
  const byId = new Map(providers.map((p) => [p.info.id, p]));
  const out: ModelRow[] = [];
  const seen = new Set<string>();
  for (const [pid, mid] of FEATURED) {
    const p = byId.get(pid);
    if (!p) continue;
    const m = p.models.find((x) => x.id === mid);
    if (!m || seen.has(`${pid}/${m.id}`)) continue;
    seen.add(`${pid}/${m.id}`);
    out.push(m);
  }
  if (out.length < 8) {
    const used = new Set(out.map((m) => m.providerId));
    for (const p of providers) {
      if (used.has(p.info.id)) continue;
      const m = p.models.find(
        (x) => x.chat && !x.id.includes("imagine") && !x.name.toLowerCase().includes("whisper"),
      );
      if (!m) continue;
      out.push(m);
      used.add(p.info.id);
      if (out.length >= 8) break;
    }
  }
  return out;
}

export function matchQuery(m: ModelRow, q: SearchQuery): boolean {
  if (q.providerId && m.providerId !== q.providerId) return false;
  if (q.protocol && q.protocol !== "any" && m.protocol !== q.protocol) return false;
  if (q.local === "local" && !m.local) return false;
  if (q.local === "cloud" && m.local) return false;
  if (q.reasoning && !m.reasoning) return false;
  if (q.tools && !m.toolCall) return false;
  if (q.vision && !m.inputMods.includes("image")) return false;
  if (q.openWeights && !m.openWeights) return false;
  if (q.chatOnly !== false && !m.chat) return false;
  const needle = (q.q ?? "").trim().toLowerCase();
  if (!needle) return true;
  const hay = `${m.providerId} ${m.providerName} ${m.id} ${m.name} ${m.family ?? ""}`.toLowerCase();
  return hay.includes(needle);
}

export function toIndex(cat: Cache, xaiReady: boolean): CatalogIndex {
  return {
    fetchedAt: new Date(cat.at).toISOString(),
    source: cat.source,
    stats: {
      providers: cat.providers.length,
      models: cat.providers.reduce((n, p) => n + p.models.length, 0),
      local: cat.providers.filter((p) => p.info.local).length,
    },
    xaiReady,
    providers: cat.providers.map((p) => p.info),
    featured: pickFeatured(cat.providers),
  };
}

const PREFERRED = [
  "xai",
  "anthropic",
  "openai",
  "google",
  "groq",
  "mistral",
  "cerebras",
  "togetherai",
  "ollama",
  "lmstudio",
  "vllm",
  "llamacpp",
];

function prefRank(id: string): number {
  const i = PREFERRED.indexOf(id);
  return i === -1 ? 100 : i;
}

function hitScore(m: ModelRow, needle: string): number {
  const mid = m.id.toLowerCase();
  const name = m.name.toLowerCase();
  const q = needle.toLowerCase();
  let s = prefRank(m.providerId);
  if (mid === q || name === q) s -= 80;
  else if (mid.startsWith(q) || name.startsWith(q)) s -= 40;
  else if (m.providerId === q) s -= 20;
  return s;
}

export function searchLoaded(cat: Cache, data: SearchQuery): SearchResult {
  const limit = Math.min(Math.max(data.limit ?? 80, 1), 200);
  const hits: ModelRow[] = [];
  for (const p of cat.providers) {
    for (const m of p.models) {
      if (!matchQuery(m, data)) continue;
      hits.push(m);
    }
  }
  const needle = (data.q ?? "").trim();
  hits.sort((a, b) => {
    const d = hitScore(a, needle) - hitScore(b, needle);
    if (d !== 0) return d;
    return `${a.providerId}/${a.id}`.localeCompare(`${b.providerId}/${b.id}`);
  });
  return { total: hits.length, results: hits.slice(0, limit) };
}

export async function resolveForChat(providerId: string, modelId: string) {
  const cat = await loadCatalog();
  const p = cat.providers.find((x) => x.info.id === providerId);
  if (!p) return null;
  const m =
    p.models.find((x) => x.id === modelId) ??
    (p.info.local ? ({ id: modelId, name: modelId, chat: true } as ModelRow) : null);
  if (!m) return null;
  return { provider: p.info, model: m };
}
