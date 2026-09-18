// MCP (Model Context Protocol) wiring — the easy way to grow Maestro's hands.
// Servers register by streamable-HTTP URL; connecting runs the initialize
// handshake + tools/list through the /api/mcp proxy (server-side, so CORS
// never bites), and enabled servers' tools join the Agent (react) harness loop.

import { create } from "zustand";

export type McpTool = {
  name: string;
  description?: string;
  schema?: unknown;
};

export type McpServerStatus = "idle" | "connecting" | "ok" | "error";

export type McpServer = {
  id: string;
  name: string;
  url: string;
  /** Optional Authorization header value, e.g. "Bearer …". Kept in-browser. */
  auth?: string;
  enabled: boolean;
  status: McpServerStatus;
  /** Tools discovered on the last successful connect. */
  tools: McpTool[];
  serverName?: string;
  serverVersion?: string;
  lastError?: string;
  addedAt: number;
};

const MCP_KEY = "maestro.mcp.servers";

export function isMcpServer(v: unknown): v is McpServer {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<McpServer>;
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.url === "string" &&
    Array.isArray(s.tools)
  );
}

function readServers(): McpServer[] {
  try {
    const raw = localStorage.getItem(MCP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isMcpServer)
      .map((s) => ({ ...s, status: "idle" as const, lastError: undefined }));
  } catch {
    return [];
  }
}

function persist(servers: McpServer[]) {
  try {
    localStorage.setItem(MCP_KEY, JSON.stringify(servers));
  } catch {
    /* ignore */
  }
}

type McpState = {
  servers: McpServer[];
  add: (input: { name: string; url: string; auth?: string }) => McpServer;
  remove: (id: string) => void;
  setEnabled: (id: string, enabled: boolean) => void;
  patch: (id: string, p: Partial<McpServer>) => void;
};

export const useMcp = create<McpState>((set) => ({
  servers: typeof window === "undefined" ? [] : readServers(),
  add: (input) => {
    const s: McpServer = {
      id: `mcp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: input.name.trim() || hostOf(input.url),
      url: input.url.trim(),
      auth: input.auth?.trim() || undefined,
      enabled: true,
      status: "idle",
      tools: [],
      addedAt: Date.now(),
    };
    set((st) => {
      const servers = [...st.servers, s];
      persist(servers);
      return { servers };
    });
    return s;
  },
  remove: (id) =>
    set((st) => {
      const servers = st.servers.filter((s) => s.id !== id);
      persist(servers);
      return { servers };
    }),
  setEnabled: (id, enabled) =>
    set((st) => {
      const servers = st.servers.map((s) => (s.id === id ? { ...s, enabled } : s));
      persist(servers);
      return { servers };
    }),
  patch: (id, p) =>
    set((st) => {
      const servers = st.servers.map((s) => (s.id === id ? { ...s, ...p } : s));
      persist(servers);
      return { servers };
    }),
}));

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "MCP server";
  }
}

/** Enabled, connected servers whose tools the react loop may offer. */
export function activeServers(servers: McpServer[]): McpServer[] {
  return servers.filter((s) => s.enabled && s.status === "ok" && s.tools.length > 0);
}

/** Sanitize a tool into a react-harness-callable name: mcp__server__tool. */
export function mcpToolName(server: McpServer, tool: string): string {
  const s = server.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "srv";
  const t = tool.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "tool";
  return `mcp__${s}__${t}`.slice(0, 60);
}

export const MCP_ADVERTISE_CAP = 16;
