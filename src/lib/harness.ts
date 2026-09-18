import { searchCatalog } from "./catalog";

export type LoopKind = "once" | "react" | "pipeline";
export type ToolId = "catalog" | "which" | "scratch" | "reflect";

export type Stage = {
  id: string;
  name: string;
  instructions: string;
};

export type Harness = {
  id: string;
  name: string;
  blurb: string;
  builtin: boolean;
  loop: LoopKind;
  instructions: string;
  tools: ToolId[];
  stages: Stage[];
  maxSteps: number;
  temperature: number | null;
  maxTokens: number | null;
};

export type TraceEvent = {
  id: string;
  kind: "stage" | "tool" | "thought";
  label: string;
  detail?: string;
};

export type ToolCtx = {
  providerId: string;
  modelId: string;
  scratch: Record<string, string>;
};

export const LOOP_META: Record<LoopKind, { label: string; blurb: string }> = {
  once: { label: "Once", blurb: "One completion. The default." },
  react: { label: "Agent", blurb: "Think, tool, repeat — Claude Code-shaped." },
  pipeline: { label: "Workflow", blurb: "Named steps in a row, Agno-skinny." },
};

export const TOOL_META: { id: ToolId; name: string; blurb: string }[] = [
  { id: "catalog", name: "catalog", blurb: "Search the models.dev stand." },
  { id: "which", name: "which", blurb: "Current provider and model." },
  { id: "scratch", name: "scratch", blurb: "A note you can read back later." },
  { id: "reflect", name: "reflect", blurb: "A beat to think before acting." },
];

// Tool names: builtin ids are lowercase words; MCP tools arrive namespaced as
// mcp__server__tool (letters, digits, underscores, dots, dashes).
const TOOL_RE = /<tool\s+name=["']([a-z0-9_.-]+)["']>\s*([\s\S]*?)\s*<\/tool>\s*$/i;

export const BUILTINS: Harness[] = [
  {
    id: "open",
    name: "Open",
    blurb: "Bare model. No extra instructions, no loop.",
    builtin: true,
    loop: "once",
    instructions: "",
    tools: [],
    stages: [],
    maxSteps: 1,
    temperature: null,
    maxTokens: null,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    blurb: "Coding agent. Smallest change. Tools when needed.",
    builtin: true,
    loop: "react",
    instructions: `You are a coding agent in the Maestro console.

Rules:
- Follow the request exactly. Do not add features that were not asked for.
- Prefer the smallest change that works. Do not gold-plate.
- Investigate with catalog or which before guessing at models or providers.
- Use reflect for a short plan before a large answer.
- Be concise. No preamble, no "sure", no recap.
- If the task is ambiguous, ask one clarifying question instead of guessing.`,
    tools: ["catalog", "which", "scratch", "reflect"],
    stages: [],
    maxSteps: 5,
    temperature: 0.3,
    maxTokens: null,
  },
  {
    id: "codex",
    name: "Codex",
    blurb: "Plan, then implement. Two movements, no chatter.",
    builtin: true,
    loop: "pipeline",
    instructions: "You write and reason about code. No filler.",
    tools: [],
    stages: [
      {
        id: "plan",
        name: "Plan",
        instructions:
          "List a numbered plan, 5 bullets max. No code yet. Call out the riskiest step.",
      },
      {
        id: "implement",
        name: "Implement",
        instructions:
          "Execute the plan. Output only the work product. Skip the recap.",
      },
    ],
    maxSteps: 2,
    temperature: 0.2,
    maxTokens: null,
  },
  {
    id: "cursor",
    name: "Cursor",
    blurb: "Pair programmer. Match their style, offer the next edit.",
    builtin: true,
    loop: "once",
    instructions: `You are a pair programmer sitting next to the user.
- Match their style and stack.
- Explain only what is not obvious.
- Offer the next edit, not a lecture.
- If you would change more than the ask, say so in one line and stop.`,
    tools: [],
    stages: [],
    maxSteps: 1,
    temperature: 0.4,
    maxTokens: null,
  },
  {
    id: "research",
    name: "Research",
    blurb: "Gather, then synthesize. Conclusion first.",
    builtin: true,
    loop: "pipeline",
    instructions: "You research. Prefer primary facts over vibes.",
    tools: [],
    stages: [
      {
        id: "gather",
        name: "Gather",
        instructions:
          "List facts, constraints, and open questions. Short bullets. No essay.",
      },
      {
        id: "synthesize",
        name: "Synthesize",
        instructions:
          "Write the answer. Lead with the conclusion. Number claims that map back to the gather list.",
      },
    ],
    maxSteps: 2,
    temperature: 0.5,
    maxTokens: null,
  },
  {
    id: "reviewer",
    name: "Reviewer",
    blurb: "Verdict, then findings by severity.",
    builtin: true,
    loop: "once",
    instructions: `Review the input.
Output, in this order:
1. Verdict — one line
2. Findings — blocker, then major, then nit. Skip empty severities.
3. What already works — max three lines.
No throat-clearing.`,
    tools: [],
    stages: [],
    maxSteps: 1,
    temperature: 0.2,
    maxTokens: null,
  },
];

export function blankHarness(id: string): Harness {
  return {
    id,
    name: "Untitled",
    blurb: "Your workflow.",
    builtin: false,
    loop: "once",
    instructions: "",
    tools: [],
    stages: [],
    maxSteps: 4,
    temperature: null,
    maxTokens: null,
  };
}

export function forkHarness(src: Harness, id: string): Harness {
  return {
    ...src,
    id,
    name: src.builtin ? `${src.name} copy` : src.name,
    blurb: src.blurb,
    builtin: false,
    stages: src.stages.map((s) => ({ ...s, id: `${id}-${s.id}` })),
    tools: [...src.tools],
  };
}

export function resolveHarness(id: string, customs: Harness[]): Harness {
  return customs.find((h) => h.id === id) ?? BUILTINS.find((h) => h.id === id) ?? BUILTINS[0];
}

export function allHarnesses(customs: Harness[]): Harness[] {
  return [...BUILTINS, ...customs];
}

export function isHarness(v: unknown): v is Harness {
  if (!v || typeof v !== "object") return false;
  const h = v as Partial<Harness>;
  return (
    typeof h.id === "string" &&
    typeof h.name === "string" &&
    (h.loop === "once" || h.loop === "react" || h.loop === "pipeline") &&
    typeof h.instructions === "string" &&
    Array.isArray(h.tools) &&
    Array.isArray(h.stages)
  );
}

export function splitTool(text: string): {
  text: string;
  call: { name: string; args: Record<string, unknown> } | null;
} {
  const m = text.match(TOOL_RE);
  if (!m || m.index == null) return { text: text.trimEnd(), call: null };
  const name = m[1].toLowerCase();
  let args: Record<string, unknown> = {};
  const raw = m[2].trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      args = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : { raw };
    } catch {
      args = { raw };
    }
  }
  return { text: text.slice(0, m.index).trimEnd(), call: { name, args } };
}

export type ExtraTool = { name: string; blurb: string };

function toolProtocol(tools: ToolId[], extraTools: ExtraTool[] = []): string {
  const allowed = TOOL_META.filter((t) => tools.includes(t.id));
  if (!allowed.length && !extraTools.length) return "";
  const catalog = allowed
    .map((t) => {
      if (t.id === "catalog") return `- catalog  { "q": "search text" }`;
      if (t.id === "which") return `- which    {}`;
      if (t.id === "scratch")
        return `- scratch  { "op": "set"|"get", "key": "note", "value": "..." }`;
      return `- reflect  { "thought": "one beat" }`;
    })
    .join("\n");
  const external = extraTools
    .map((t) => `- ${t.name}  (JSON args per its schema) — ${t.blurb}`)
    .join("\n");
  return `You may call a tool by ending your reply with a single tag and nothing after it:

<tool name="catalog">{"q":"grok"}</tool>

Available tools:
${[catalog, external].filter(Boolean).join("\n")}

If you can answer without a tool, do not emit a tool tag.`;
}

export function compileSystem(h: Harness, overlay?: string, extraTools?: ExtraTool[]): string {
  const parts: string[] = [];
  if (h.instructions.trim()) parts.push(h.instructions.trim());
  if (h.loop === "react") {
    const proto = toolProtocol(h.tools, extraTools);
    if (proto) parts.push(proto);
  }
  if (overlay?.trim()) parts.push(overlay.trim());
  return parts.join("\n\n");
}

export function compileStage(
  h: Harness,
  stage: Stage,
  overlay?: string,
): string {
  const parts: string[] = [];
  if (h.instructions.trim()) parts.push(h.instructions.trim());
  parts.push(`You are the ${stage.name} step of a short workflow. Do only this step.`);
  if (stage.instructions.trim()) parts.push(stage.instructions.trim());
  if (overlay?.trim()) parts.push(overlay.trim());
  return parts.join("\n\n");
}

export function workflowPreview(h: Harness): string {
  if (h.loop === "pipeline") {
    const steps = (h.stages.length ? h.stages : [{ name: "Step" }])
      .map((s) => `"${s.name.replace(/"/g, "")}"`)
      .join(", ");
    return `score = Workflow(\n    name="${h.name.replace(/"/g, "")}",\n    steps=[${steps}],\n)`;
  }
  if (h.loop === "react") {
    const tools = h.tools.map((t) => t).join(", ") || "—";
    return `agent = Agent(\n    name="${h.name.replace(/"/g, "")}",\n    tools=[${tools}],\n    max_steps=${h.maxSteps},\n)`;
  }
  return `chat = Open(\n    name="${h.name.replace(/"/g, "")}",\n)`;
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolCtx,
): Promise<string> {
  switch (name) {
    case "catalog": {
      const q = String(args.q ?? args.query ?? "").slice(0, 80);
      const r = await searchCatalog({
        data: { q, chatOnly: true, limit: 8 },
      });
      if (!r.results.length) return q ? `No models matched “${q}”.` : "No models matched.";
      return r.results
        .map(
          (m) =>
            `${m.providerId}/${m.id}  ${m.name}  ctx=${m.context ?? "—"}`,
        )
        .join("\n");
    }
    case "which":
      return `${ctx.providerId}/${ctx.modelId}`;
    case "scratch": {
      const op = String(args.op ?? "get");
      const key = String(args.key ?? "note").slice(0, 40);
      if (op === "set") {
        ctx.scratch[key] = String(args.value ?? "").slice(0, 2000);
        return `saved ${key}`;
      }
      return ctx.scratch[key] ?? "(empty)";
    }
    case "reflect":
      return `noted: ${String(args.thought ?? "").slice(0, 400) || "ok"}`;
    default:
      return `unknown tool ${name}`;
  }
}

export function startersFor(h: Harness): string[] {
  if (h.id === "claude-code" || h.id === "codex" || h.id === "cursor") {
    return [
      "Write a 12-line Python function that streams an OpenAI-compatible chat completion.",
      "Review this snippet for protocol mix-ups: fetch('/v1/messages') with an OpenAI key.",
      "Refactor a stdlib http_stream helper to yield deltas instead of printing.",
    ];
  }
  if (h.id === "research") {
    return [
      "Compare OpenAI Chat Completions and Anthropic Messages for a BYOK router.",
      "Which local runtimes speak the OpenAI protocol, and what ports do they use?",
      "What should a conductor know before routing Ollama next to Claude?",
    ];
  }
  if (h.id === "reviewer") {
    return [
      "Review this system prompt for a coding agent. Cut anything that is fat.",
      "Verdict on mixing OpenAI and Anthropic payloads in one client function.",
      "Nitpick this CLI help text for a single-file Python conductor.",
    ];
  }
  return [
    "Explain the difference between the OpenAI and Anthropic message protocols in one paragraph.",
    "Write a 12-line Python function that streams an OpenAI-compatible chat completion.",
    "What should a conductor know before routing a local Ollama model next to Claude?",
  ];
}
