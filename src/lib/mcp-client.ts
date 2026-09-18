// Browser side of the MCP bridge. All wire traffic goes through /api/mcp.
// Flow per connect: initialize (grabs the session id) → notifications/
// initialized → tools/list. tools/call gets a fresh session each time — cheap
// on streamable-HTTP servers and stateless-correct.

import type { McpServer, McpTool } from "./mcp";

const PROTOCOL_VERSION = "2025-03-26";
let rpcSeq = 0;

type RpcReply = {
  result?: unknown;
  error?: { message?: string } | string;
};

async function rpc(
  server: Pick<McpServer, "url" | "auth">,
  method: string,
  params: unknown,
  sessionId?: string,
  withId = true,
): Promise<{ result: unknown; sessionId?: string }> {
  const res = await fetch("/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: server.url,
      auth: server.auth,
      sessionId,
      rpc: { id: withId ? ++rpcSeq : null, method, params },
    }),
  });
  const j = (await res.json()) as {
    rpc?: RpcReply;
    ok?: boolean;
    sessionId?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(j.error || `Bridge error ${res.status}`);
  if (j.error) throw new Error(j.error);
  const msg = j.rpc;
  if (msg?.error) {
    throw new Error(typeof msg.error === "string" ? msg.error : msg.error.message || "RPC error");
  }
  return { result: msg ? msg.result : j, sessionId: j.sessionId };
}

export type McpConnectResult = {
  tools: McpTool[];
  serverName?: string;
  serverVersion?: string;
};

export async function connectMcp(
  server: Pick<McpServer, "url" | "auth">,
): Promise<McpConnectResult> {
  const init = await rpc(server, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "maestro", version: "1.0.0" },
  });
  const info = init.result as
    | { serverInfo?: { name?: string; version?: string } }
    | undefined;
  const sessionId = init.sessionId;
  // Best-effort — some minimal servers don't implement notifications.
  try {
    await rpc(server, "notifications/initialized", {}, sessionId, false);
  } catch {
    /* non-fatal */
  }
  const list = await rpc(server, "tools/list", {}, sessionId);
  const raw = (list.result as { tools?: unknown[] } | undefined)?.tools ?? [];
  const tools: McpTool[] = raw
    .filter((t): t is { name: string; description?: string; inputSchema?: unknown } =>
      Boolean(t && typeof t === "object" && typeof (t as { name?: unknown }).name === "string"),
    )
    .map((t) => ({ name: t.name, description: t.description, schema: t.inputSchema }));
  return {
    tools,
    serverName: info?.serverInfo?.name,
    serverVersion: info?.serverInfo?.version,
  };
}

/** Invoke an MCP tool; returns the text content of the call. */
export async function callMcpTool(
  server: Pick<McpServer, "url" | "auth">,
  tool: string,
  args: Record<string, unknown>,
): Promise<string> {
  const init = await rpc(server, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "maestro", version: "1.0.0" },
  });
  const sessionId = init.sessionId;
  try {
    await rpc(server, "notifications/initialized", {}, sessionId, false);
  } catch {
    /* non-fatal */
  }
  const out = await rpc(server, "tools/call", { name: tool, arguments: args }, sessionId);
  const result = out.result as
    | { content?: { type?: string; text?: string }[]; isError?: boolean }
    | undefined;
  const text = (result?.content ?? [])
    .map((c) => (c.type === "text" && typeof c.text === "string" ? c.text : ""))
    .filter(Boolean)
    .join("\n");
  if (result?.isError) throw new Error(text || "Tool call failed");
  return text || "(no output)";
}
