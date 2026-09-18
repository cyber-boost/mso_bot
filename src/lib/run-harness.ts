import { streamChat } from "./chat";
import {
  compileStage,
  compileSystem,
  runTool,
  splitTool,
  type ExtraTool,
  type Harness,
  type ToolCtx,
  type ToolId,
  type TraceEvent,
} from "./harness";
import { callMcpTool } from "./mcp-client";
import { activeServers, MCP_ADVERTISE_CAP, mcpToolName, useMcp, type McpServer } from "./mcp";
import type { ChatMessage } from "./protocol";

type McpRuntimeTool = { wire: string; server: McpServer; tool: string; blurb: string };

/** Enabled + connected MCP servers' tools, flattened for the react loop. */
function gatherMcpTools(): McpRuntimeTool[] {
  const out: McpRuntimeTool[] = [];
  for (const server of activeServers(useMcp.getState().servers)) {
    for (const t of server.tools) {
      if (out.length >= MCP_ADVERTISE_CAP) return out;
      out.push({
        wire: mcpToolName(server, t.name),
        server,
        tool: t.name,
        blurb: (t.description ?? `${server.name} tool`).slice(0, 100),
      });
    }
  }
  return out;
}

export type RunRequest = {
  harness: Harness;
  overlay: string;
  history: ChatMessage[];
  providerId: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
  ctx: ToolCtx;
};

export type RunHooks = {
  onText: (text: string) => void;
  onTraces: (traces: TraceEvent[]) => void;
  signal: AbortSignal;
};

function sys(content: string): ChatMessage[] {
  return content.trim() ? [{ role: "system", content }] : [];
}

async function complete(
  req: RunRequest,
  messages: ChatMessage[],
  onAcc: (text: string) => void,
  signal: AbortSignal,
): Promise<string> {
  let acc = "";
  await streamChat(
    {
      providerId: req.providerId,
      modelId: req.modelId,
      messages,
      temperature: req.harness.temperature ?? req.temperature,
      maxTokens: req.harness.maxTokens ?? req.maxTokens,
      apiKey: req.apiKey,
    },
    (text) => {
      acc = text;
      onAcc(text);
    },
    signal,
  );
  return acc;
}

export async function runWithHarness(req: RunRequest, hooks: RunHooks): Promise<void> {
  const { harness } = req;
  if (harness.loop === "pipeline" && harness.stages.length > 0) {
    await runPipeline(req, hooks);
    return;
  }
  if (harness.loop === "react") {
    await runReact(req, hooks);
    return;
  }
  const messages = [...sys(compileSystem(harness, req.overlay)), ...req.history];
  await complete(req, messages, hooks.onText, hooks.signal);
}

async function runReact(req: RunRequest, hooks: RunHooks): Promise<void> {
  const traces: TraceEvent[] = [];
  const mcpTools = gatherMcpTools();
  const extraTools: ExtraTool[] = mcpTools.map((t) => ({ name: t.wire, blurb: t.blurb }));
  const messages: ChatMessage[] = [
    ...sys(compileSystem(req.harness, req.overlay, extraTools)),
    ...req.history,
  ];
  const maxSteps = Math.min(Math.max(req.harness.maxSteps || 4, 1), 6);
  let shown = "";

  for (let i = 0; i < maxSteps; i++) {
    if (hooks.signal.aborted) return;
    const acc = await complete(
      req,
      messages,
      (text) => hooks.onText(shown + text),
      hooks.signal,
    );
    const { text, call } = splitTool(acc);
    shown = shown + text;
    hooks.onText(shown);
    if (!call) return;

    // MCP tool? Dispatch over the bridge to the owning server.
    const mcp = call.name.startsWith("mcp__") ? mcpTools.find((t) => t.wire === call.name) : null;
    if (mcp) {
      let result: string;
      try {
        result = await callMcpTool(mcp.server, mcp.tool, call.args);
        result = result.slice(0, 4000);
      } catch (e) {
        result = `MCP error: ${e instanceof Error ? e.message : "call failed"}`;
      }
      traces.push({
        id: crypto.randomUUID(),
        kind: "tool",
        label: `${mcp.server.name} · ${mcp.tool}`,
        detail: result.split("\n")[0]?.slice(0, 80),
      });
      hooks.onTraces([...traces]);
      messages.push({ role: "assistant", content: acc });
      messages.push({ role: "user", content: `TOOL RESULT (${mcp.wire}):\n${result}` });
      if (shown) shown += "\n\n";
      continue;
    }

    if (!req.harness.tools.includes(call.name as ToolId)) {
      traces.push({
        id: crypto.randomUUID(),
        kind: "tool",
        label: call.name,
        detail: "not in this harness",
      });
      hooks.onTraces([...traces]);
      return;
    }
    const result = await runTool(call.name, call.args, req.ctx);
    traces.push({
      id: crypto.randomUUID(),
      kind: "tool",
      label: call.name,
      detail: result.split("\n")[0]?.slice(0, 80),
    });
    hooks.onTraces([...traces]);
    messages.push({ role: "assistant", content: acc });
    messages.push({
      role: "user",
      content: `TOOL RESULT (${call.name}):\n${result}`,
    });
    if (shown) shown += "\n\n";
  }
}

async function runPipeline(req: RunRequest, hooks: RunHooks): Promise<void> {
  const traces: TraceEvent[] = [];
  const prior = req.history.filter((m) => m.role !== "system");
  const topic = [...prior].reverse().find((m) => m.role === "user")?.content ?? "";
  let prev = "";
  let shown = "";

  for (const stage of req.harness.stages.slice(0, 5)) {
    if (hooks.signal.aborted) return;
    traces.push({
      id: crypto.randomUUID(),
      kind: "stage",
      label: stage.name,
    });
    hooks.onTraces([...traces]);
    const heading = shown ? `\n\n${stage.name}\n` : `${stage.name}\n`;
    shown += heading;
    hooks.onText(shown);
    const user =
      prev.trim().length === 0
        ? topic
        : `${topic}\n\n---\nPrior step (${traces[traces.length - 2]?.label ?? "previous"}):\n${prev}`;
    const acc = await complete(
      req,
      [
        ...sys(compileStage(req.harness, stage, req.overlay)),
        { role: "user", content: user },
      ],
      (text) => hooks.onText(shown + text),
      hooks.signal,
    );
    prev = acc;
    shown += acc;
    hooks.onText(shown);
  }
}
