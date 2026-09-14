import { createFileRoute } from "@tanstack/react-router";
import { resolveForChat } from "@/lib/catalog-load.server";
import {
  anthropicBody,
  chatPath,
  openaiBody,
  resolveBaseUrl,
  type ChatMessage,
} from "@/lib/protocol";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          providerId?: string;
          modelId?: string;
          messages?: ChatMessage[];
          temperature?: number;
          maxTokens?: number;
          apiKey?: string;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const providerId = (body.providerId ?? "").trim();
        const modelId = (body.modelId ?? "").trim();
        if (!providerId || !modelId) {
          return Response.json({ error: "providerId and modelId are required" }, { status: 400 });
        }

        const resolved = await resolveForChat(providerId, modelId);
        if (!resolved) {
          return Response.json({ error: `Unknown model ${providerId}/${modelId}` }, { status: 404 });
        }

        const { provider } = resolved;
        if (provider.local) {
          return Response.json(
            {
              error:
                "Local endpoints are reached from the Python CLI on your machine, not from this console.",
            },
            { status: 400 },
          );
        }

        const base = resolveBaseUrl(provider.id, provider.api);
        if (!base || !base.startsWith("https://")) {
          return Response.json(
            { error: `No HTTPS endpoint for ${provider.name}. Set one in the CLI.` },
            { status: 400 },
          );
        }

        const messages = Array.isArray(body.messages) ? body.messages.slice(-40) : [];
        const cleaned: ChatMessage[] = messages
          .filter((m) => m && typeof m.content === "string" && m.content.trim())
          .map((m) => ({
            role: m.role === "system" || m.role === "assistant" ? m.role : "user",
            content: m.content.slice(0, 8000),
          }));
        if (!cleaned.some((m) => m.role === "user")) {
          return Response.json({ error: "Send at least one user message" }, { status: 400 });
        }

        const maxTokens = Math.min(Math.max(Number(body.maxTokens) || 1024, 16), 2048);
        const temperature = Math.min(Math.max(Number(body.temperature) || 0.7, 0), 2);

        const userKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
        const platformXai = provider.id === "xai" ? process.env.XAI_API_KEY : undefined;
        const apiKey = userKey || platformXai || "";
        if (!apiKey) {
          const env = provider.env[0] ?? `${provider.id.toUpperCase()}_API_KEY`;
          return Response.json(
            { error: `Add a key for ${provider.name} (${env}) in Keys.` },
            { status: 401 },
          );
        }

        const protocol = provider.protocol;
        const url = `${base}${chatPath(protocol)}`;
        const payload =
          protocol === "anthropic"
            ? anthropicBody(modelId, cleaned, { stream: true, temperature, maxTokens })
            : openaiBody(modelId, cleaned, { stream: true, temperature, maxTokens });

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (protocol === "anthropic") {
          headers["x-api-key"] = apiKey;
          headers["anthropic-version"] = "2023-06-01";
        } else {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        let upstream: Response;
        try {
          upstream = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });
        } catch {
          return Response.json({ error: `Could not reach ${provider.name}` }, { status: 502 });
        }

        if (!upstream.ok || !upstream.body) {
          let detail = `Provider error ${upstream.status}`;
          try {
            const t = await upstream.text();
            const j = JSON.parse(t) as {
              error?: { message?: string } | string;
              message?: string;
            };
            if (typeof j.error === "string") detail = j.error;
            else if (j.error?.message) detail = j.error.message;
            else if (j.message) detail = j.message;
          } catch {
            /* keep status */
          }
          return Response.json({ error: detail }, { status: 502 });
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const reader = upstream.body!.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            const send = (obj: unknown) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
            };
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith("data:")) continue;
                  const data = trimmed.slice(5).trim();
                  if (!data || data === "[DONE]") continue;
                  try {
                    const json = JSON.parse(data) as Record<string, unknown>;
                    const delta = extractDelta(protocol, json);
                    if (delta) send({ delta });
                    const usage = extractUsage(json);
                    if (usage) send({ usage });
                  } catch {
                    /* skip malformed chunk */
                  }
                }
              }
              send({ done: true });
            } catch (err) {
              send({ error: err instanceof Error ? err.message : "Stream failed" });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
          },
        });
      },
    },
  },
});

function extractDelta(protocol: "openai" | "anthropic", json: Record<string, unknown>): string {
  if (protocol === "anthropic") {
    const type = json.type;
    if (type === "content_block_delta") {
      const delta = json.delta as { type?: string; text?: string } | undefined;
      return delta?.text ?? "";
    }
    return "";
  }
  const choices = json.choices as Array<{ delta?: { content?: string } }> | undefined;
  return choices?.[0]?.delta?.content ?? "";
}

function extractUsage(json: Record<string, unknown>): { prompt?: number; completion?: number } | null {
  const usage = json.usage as
    | { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number }
    | undefined;
  if (!usage) return null;
  const prompt = usage.prompt_tokens ?? usage.input_tokens;
  const completion = usage.completion_tokens ?? usage.output_tokens;
  if (prompt == null && completion == null) return null;
  return { prompt, completion };
}
