import type { ChatMessage } from "./protocol";

export type ChatRequest = {
  providerId: string;
  modelId: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  apiKey?: string;
};

export async function streamChat(
  req: ChatRequest,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ usage?: { prompt?: number; completion?: number } }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    let msg = `Chat failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let acc = "";
  let usage: { prompt?: number; completion?: number } | undefined;

  const consume = (chunk: string) => {
    for (const rawLine of chunk.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let ev: { delta?: string; error?: string; usage?: { prompt?: number; completion?: number } };
      try {
        ev = JSON.parse(payload) as typeof ev;
      } catch {
        continue;
      }
      if (ev.error) throw new Error(ev.error);
      if (typeof ev.delta === "string" && ev.delta) {
        acc += ev.delta;
        onDelta(acc);
      }
      if (ev.usage) usage = ev.usage;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    consume(parts.join("\n"));
  }
  buf += decoder.decode();
  if (buf.trim()) consume(buf);
  if (acc) onDelta(acc);
  return { usage };
}
