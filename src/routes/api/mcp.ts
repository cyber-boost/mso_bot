import { createFileRoute } from "@tanstack/react-router";

// CORS-safe MCP bridge: the browser posts a JSON-RPC envelope plus the target
// server URL, and this route talks to the MCP server (streamable HTTP
// transport) on the browser's behalf. MCP endpoints almost never send CORS
// headers, and holding the fetch server-side also keeps the optional auth
// header out of other origins' reach.

type ProxyBody = {
  url?: string;
  auth?: string;
  sessionId?: string;
  rpc?: {
    jsonrpc?: string;
    id?: string | number | null;
    method?: string;
    params?: unknown;
  };
};

const TIMEOUT_MS = 15_000;

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: ProxyBody;
        try {
          body = (await request.json()) as ProxyBody;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const url = (body.url ?? "").trim();
        let target: URL;
        try {
          target = new URL(url);
        } catch {
          return Response.json({ error: "A valid http(s) MCP URL is required" }, { status: 400 });
        }
        if (target.protocol !== "https:" && target.protocol !== "http:") {
          return Response.json({ error: "Only http(s) MCP endpoints are supported" }, { status: 400 });
        }

        const rpc = body.rpc;
        if (!rpc || typeof rpc.method !== "string" || !rpc.method) {
          return Response.json({ error: "rpc.method is required" }, { status: 400 });
        }
        // Only the handful of MCP verbs this console actually speaks — the
        // bridge is for tool use, not an open proxy.
        const allowed = /^(initialize|initialized|notifications\/[a-z_]+|tools\/list|tools\/call|ping)$/;
        if (!allowed.test(rpc.method)) {
          return Response.json({ error: `Method ${rpc.method} is not supported` }, { status: 400 });
        }

        const isNotification = rpc.id === undefined || rpc.id === null;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        };
        if (body.sessionId) headers["mcp-session-id"] = body.sessionId;
        if (typeof body.auth === "string" && body.auth.trim()) {
          headers.Authorization = body.auth.trim();
        }

        let upstream: Response;
        try {
          upstream = await fetch(target, {
            method: "POST",
            headers,
            body: JSON.stringify({
              jsonrpc: "2.0",
              ...(isNotification ? {} : { id: rpc.id }),
              method: rpc.method,
              params: rpc.params ?? {},
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
        } catch (e) {
          const msg = e instanceof Error && e.name === "TimeoutError" ? "Timed out" : "Unreachable";
          return Response.json({ error: `${msg}: ${url}` }, { status: 502 });
        }

        const sessionId = upstream.headers.get("mcp-session-id") ?? undefined;

        // Notifications legitimately return 202 with no body.
        if (upstream.status === 202) {
          return Response.json({ ok: true, sessionId });
        }
        if (!upstream.ok) {
          let detail = `MCP server error ${upstream.status}`;
          try {
            const t = (await upstream.text()).slice(0, 300);
            if (t.trim()) detail = `${detail} — ${t.trim()}`;
          } catch {
            /* keep status */
          }
          return Response.json({ error: detail, sessionId }, { status: 502 });
        }

        const contentType = upstream.headers.get("content-type") ?? "";
        try {
          if (contentType.includes("text/event-stream")) {
            const text = await upstream.text();
            const message = lastSseMessage(text);
            if (message == null) {
              return Response.json({ ok: true, sessionId });
            }
            return Response.json({ rpc: message, sessionId });
          }
          const json = (await upstream.json()) as unknown;
          return Response.json({ rpc: json, sessionId });
        } catch {
          return Response.json({ error: "Could not parse the MCP response" }, { status: 502 });
        }
      },
    },
  },
});

/** Extract the last JSON-RPC message from an SSE payload's `data:` lines. */
function lastSseMessage(text: string): unknown {
  let last: unknown = null;
  let dataLines: string[] = [];
  const flush = () => {
    if (!dataLines.length) return;
    const raw = dataLines.join("\n").trim();
    dataLines = [];
    if (!raw) return;
    try {
      last = JSON.parse(raw);
    } catch {
      /* not json — skip */
    }
  };
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  flush();
  return last;
}
