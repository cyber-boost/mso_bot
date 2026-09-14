/** OpenAI Chat Completions vs Anthropic Messages — how Maestro talks to a provider. */

export type Protocol = "openai" | "anthropic";

export const KNOWN_BASE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  xai: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  mistral: "https://api.mistral.ai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  togetherai: "https://api.together.xyz/v1",
  deepinfra: "https://api.deepinfra.com/v1/openai",
  perplexity: "https://api.perplexity.ai",
  vercel: "https://ai-gateway.vercel.sh/v1",
  v0: "https://ai-gateway.vercel.sh/v1",
  cohere: "https://api.cohere.ai/compatibility/v1",
};

export const SYNTHETIC_LOCAL: Record<
  string,
  { name: string; api: string; env: string[] }
> = {
  ollama: {
    name: "Ollama",
    api: "http://127.0.0.1:11434/v1",
    env: ["OLLAMA_API_KEY"],
  },
  vllm: {
    name: "vLLM",
    api: "http://127.0.0.1:8000/v1",
    env: ["VLLM_API_KEY"],
  },
  llamacpp: {
    name: "llama.cpp",
    api: "http://127.0.0.1:8080/v1",
    env: ["LLAMACPP_API_KEY"],
  },
};

export function protocolOf(npm: string | null | undefined): Protocol {
  return (npm ?? "").includes("anthropic") ? "anthropic" : "openai";
}

export function isLocalApi(api: string | null | undefined): boolean {
  if (!api) return false;
  try {
    const u = new URL(api);
    const host = u.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

export function resolveBaseUrl(
  providerId: string,
  api: string | null | undefined,
): string | null {
  if (api && api.trim()) return api.replace(/\/+$/, "");
  return KNOWN_BASE[providerId] ?? null;
}

export function chatPath(protocol: Protocol): string {
  return protocol === "anthropic" ? "/messages" : "/chat/completions";
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function openaiBody(
  model: string,
  messages: ChatMessage[],
  opts: { stream: boolean; temperature?: number; maxTokens: number },
) {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: opts.stream,
    max_tokens: opts.maxTokens,
  };
  if (opts.temperature != null) body.temperature = opts.temperature;
  return body;
}

export function anthropicBody(
  model: string,
  messages: ChatMessage[],
  opts: { stream: boolean; temperature?: number; maxTokens: number },
) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
  const body: Record<string, unknown> = {
    model,
    messages: rest,
    max_tokens: opts.maxTokens,
    stream: opts.stream,
  };
  if (system) body.system = system;
  if (opts.temperature != null) body.temperature = opts.temperature;
  return body;
}

export function isChatModel(outputMods: string[] | undefined): boolean {
  const out = outputMods?.length ? outputMods : ["text"];
  return out.includes("text");
}
