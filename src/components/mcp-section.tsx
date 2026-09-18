import {
  ChevronDown,
  Plug,
  PlugZap,
  RefreshCw,
  Trash2,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMcp, type McpServer } from "@/lib/mcp";
import { connectMcp } from "@/lib/mcp-client";
import { cn } from "@/lib/utils";

/** Add-and-connect panel for MCP (Model Context Protocol) tool servers. */
export function McpSection() {
  const servers = useMcp((s) => s.servers);
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-lg bg-surface shadow-[0_0_0_1px_var(--color-border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <PlugZap className="size-4 text-muted" />
        <span className="text-sm text-fg">Tool connections</span>
        <span className="text-micro text-subtle">MCP</span>
        <span className="ml-auto inline-flex items-center gap-2 text-micro text-muted">
          {servers.length > 0 ? `${servers.length} server${servers.length === 1 ? "" : "s"}` : "none yet"}
          <ChevronDown className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
          <p className="text-xs leading-relaxed text-muted">
            Point Maestro at any streamable-HTTP MCP server and its tools join the
            Agent harness loop. Paste a URL, hit connect — that's the whole ritual.
            Traffic rides through this console's server, so CORS never gets a vote.
          </p>
          <AddServerForm />
          {servers.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {servers.map((s) => (
                <ServerRow key={s.id} server={s} />
              ))}
            </ul>
          ) : (
            <p className="rounded-md bg-bg px-3 py-2 text-micro text-subtle">
              No servers yet. Local stacks usually expose one on
              {" "}http://127.0.0.1:&lt;port&gt;/mcp — hosted ones hand you an https URL.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function AddServerForm() {
  const add = useMcp((s) => s.add);
  const patch = useMcp((s) => s.patch);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState("");
  const [busy, setBusy] = useState(false);

  async function addAndConnect() {
    if (!url.trim() || busy) return;
    setBusy(true);
    const s = add({ name, url, auth });
    patch(s.id, { status: "connecting" });
    try {
      const r = await connectMcp(s);
      patch(s.id, {
        status: "ok",
        tools: r.tools,
        serverName: r.serverName,
        serverVersion: r.serverVersion,
        lastError: undefined,
      });
    } catch (e) {
      patch(s.id, {
        status: "error",
        lastError: e instanceof Error ? e.message : "Connect failed",
      });
    } finally {
      setBusy(false);
      setName("");
      setUrl("");
      setAuth("");
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void addAndConnect();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          maxLength={40}
          className="h-10 rounded-md bg-bg px-3 text-sm text-fg placeholder:text-subtle shadow-[0_0_0_1px_var(--color-border)] focus:outline-none focus:shadow-[0_0_0_1px_var(--color-border-strong)]"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://server.example/mcp"
          inputMode="url"
          className="h-10 rounded-md bg-bg px-3 text-sm text-fg placeholder:text-subtle shadow-[0_0_0_1px_var(--color-border)] focus:outline-none focus:shadow-[0_0_0_1px_var(--color-border-strong)]"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={auth}
          onChange={(e) => setAuth(e.target.value)}
          placeholder="Auth header (optional) — e.g. Bearer ey…"
          autoComplete="off"
          className="h-10 flex-1 rounded-md bg-bg px-3 text-sm text-fg placeholder:text-subtle shadow-[0_0_0_1px_var(--color-border)] focus:outline-none focus:shadow-[0_0_0_1px_var(--color-border-strong)]"
        />
        <Button type="submit" disabled={!url.trim() || busy} className="shrink-0">
          <Plug className="size-3.5" />
          {busy ? "Connecting…" : "Add & connect"}
        </Button>
      </div>
    </form>
  );
}

function ServerRow({ server }: { server: McpServer }) {
  const { patch, remove, setEnabled } = useMcp();
  const [expanded, setExpanded] = useState(false);

  async function reconnect() {
    if (server.status === "connecting") return;
    patch(server.id, { status: "connecting", lastError: undefined });
    try {
      const r = await connectMcp(server);
      patch(server.id, {
        status: "ok",
        tools: r.tools,
        serverName: r.serverName,
        serverVersion: r.serverVersion,
      });
    } catch (e) {
      patch(server.id, {
        status: "error",
        lastError: e instanceof Error ? e.message : "Connect failed",
      });
    }
  }

  return (
    <li className="rounded-md bg-bg px-3 py-2.5 shadow-[0_0_0_1px_var(--color-border)]">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            server.status === "ok" && "bg-ok",
            server.status === "error" && "bg-danger",
            server.status === "connecting" && "bg-muted pulse-dot pulse-dot-fast",
            server.status === "idle" && "bg-subtle",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-xs text-fg">{server.name}</span>
            {server.serverName ? (
              <span className="text-micro text-subtle">
                {server.serverName}
                {server.serverVersion ? ` ${server.serverVersion}` : ""}
              </span>
            ) : null}
          </div>
          <div className="truncate text-micro text-subtle">{server.url}</div>
        </div>
        <button
          type="button"
          onClick={() => setEnabled(server.id, !server.enabled)}
          className={cn(
            "h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors duration-150",
            server.enabled ? "bg-ok/80" : "bg-elevated",
          )}
          role="switch"
          aria-checked={server.enabled}
          title={server.enabled ? "Enabled — tools join the Agent loop" : "Disabled"}
        >
          <span
            className={cn(
              "block size-5 rounded-full bg-bg transition-transform duration-150",
              server.enabled && "translate-x-5",
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => void reconnect()}
          className="rounded-xs p-1.5 text-muted hover:text-fg"
          title="Reconnect & refresh tools"
        >
          <RefreshCw className={cn("size-3.5", server.status === "connecting" && "animate-spin")} />
        </button>
        <button
          type="button"
          onClick={() => remove(server.id)}
          className="rounded-xs p-1.5 text-muted hover:text-danger"
          title="Remove"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {server.status === "error" && server.lastError ? (
        <p className="mt-1.5 text-micro text-danger">{server.lastError}</p>
      ) : null}

      {server.status === "ok" ? (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-micro text-muted hover:text-fg"
            aria-expanded={expanded}
          >
            <Wrench className="size-3" />
            {server.tools.length} tool{server.tools.length === 1 ? "" : "s"}
            {server.enabled ? " offered to the Agent loop" : " parked (off)"}
            <ChevronDown className={cn("size-3 transition-transform duration-150", expanded && "rotate-180")} />
          </button>
          {expanded ? (
            <ul className="mt-1.5 flex flex-col gap-1">
              {server.tools.map((t) => (
                <li key={t.name} className="rounded-xs bg-surface px-2 py-1.5">
                  <span className="font-mono text-micro text-fg">{t.name}</span>
                  {t.description ? (
                    <p className="mt-0.5 text-micro leading-relaxed text-muted">{t.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : server.status === "idle" ? (
        <button
          type="button"
          onClick={() => void reconnect()}
          className="mt-1.5 text-micro text-muted hover:text-fg"
        >
          Not connected — reconnect
        </button>
      ) : null}
    </li>
  );
}
