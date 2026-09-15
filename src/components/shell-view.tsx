import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Terminal as TermIcon, Trophy, Plus, RotateCcw } from "lucide-react";
import { THEME, BotConfig, LogEntry, levelTitle } from "@/lib/shell";
import { useShell } from "@/lib/shell-store";
import { useMaestro } from "@/lib/store";
import { streamChat } from "@/lib/chat";
import RobotAvatar from "@/components/shell/RobotAvatar";
import BackgroundTraces from "@/components/shell/BackgroundTraces";
import CircuitDecorations from "@/components/shell/CircuitDecorations";

// Map a provider/model onto a robot bot persona.
const PALLETTE: { head: string; body: string; ball: string; accent: string; fem: boolean }[] = [
  { head: "#1ba0c8", body: "#0e2a3f", ball: "#6ef3ff", accent: "#00d4ff", fem: false },
  { head: "#2d5a4a", body: "#12291f", ball: "#7dffb0", accent: "#22c55e", fem: true },
  { head: "#7a5a9e", body: "#241a36", ball: "#d8a0ff", accent: "#a855f7", fem: true },
  { head: "#b87355", body: "#332016", ball: "#ffb08a", accent: "#f59e0b", fem: false },
  { head: "#4a5c85", body: "#171f33", ball: "#9ec2ff", accent: "#60a5fa", fem: false },
  { head: "#9a2f4f", body: "#2a0e1a", ball: "#ff8ab0", accent: "#ec4899", fem: true },
];

function botFor(index: number, providerId: string, modelId: string): BotConfig {
  const p = PALLETTE[index % PALLETTE.length];
  return {
    id: `${providerId}:${modelId}`,
    name: modelId.length > 14 ? modelId.slice(0, 13) + "…" : modelId,
    provider: providerId,
    model: modelId,
    head: p.head,
    body: p.body,
    antennaBall: p.ball,
    accent: p.accent,
    fem: p.fem,
  };
}

export function ShellView({
  index,
}: {
  index: { providers: { id: string; name: string }[] };
}) {
  const { selection, keys, hydrate } = useMaestro();
  const providers = index.providers || [];
  const [deployed, setDeployed] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const xtermEl = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const pendingRef = useRef<string>("");
  const shell = useShell();
  const bot = botFor(0, selection.providerId, selection.modelId);
  const st = shell.getState(bot.name);
  const ready = Boolean(keys[selection.providerId]) || selection.providerId === "xai";

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // One xterm, stable across renders.
  useEffect(() => {
    if (!xtermEl.current) return;
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "'IBM Plex Mono', monospace",
      convertEol: true,
      theme: {
        background: THEME.termBg,
        foreground: "rgba(220,240,255,0.9)",
        cursor: "rgba(220,240,255,0.9)",
        blue: "#00d4ff",
        cyan: "#06b6d4",
        green: "#22c55e",
        yellow: "#f59e0b",
        red: "#ef4444",
        magenta: "#a855f7",
      },
    });
    term.open(xtermEl.current);
    termRef.current = term;
    term.writeln("\x1b[36m\x1b[1m  MAESTRO SHELL\x1b[0m");
    term.writeln("\x1b[90m  Local terminal · type a prompt and run\x1b[0m");
    term.writeln("");
    return () => {
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // Stream any pending text into xterm.
  const flushPending = () => {
    if (pendingRef.current && termRef.current) {
      termRef.current.write(pendingRef.current);
      pendingRef.current = "";
    }
  };

  const spawnLog = (message: string, level: LogEntry["level"] = "info") => {
    setLogs((l) => [
      ...l.slice(-60),
      { id: crypto.randomUUID(), pid: st.pid, level, timestamp: new Date().toLocaleTimeString(), message },
    ]);
    const line = `\x1b[90m[${new Date().toLocaleTimeString()}]\x1b[0m ${message}\n`;
    pendingRef.current += line;
    setTimeout(flushPending, 0);
    if (level === "error") setDeployed(bot.name);
  };

  const runPrompt = async () => {
    const arg = prompt.trim();
    if (!arg || busy) return;
    setPrompt("");
    setBusy(true);
    spawnLog(`$ ${arg}`, "info");
    pendingRef.current += "\x1b[32m▸\x1b[0m ";
    flushPending();
    const g = shell.recordCommand(bot.name);
    try {
      await streamChat(
        {
          providerId: selection.providerId,
          modelId: selection.modelId,
          messages: [{ role: "user", content: arg.slice(0, 1000) }],
          temperature: 0.7,
          maxTokens: 240,
          apiKey: keys[selection.providerId] || undefined,
        },
        (text) => {
          pendingRef.current = text + "\n";
          flushPending();
        },
      );
      spawnLog(`✓ ${g.xpGained} XP`, "success");
    } catch (e) {
      spawnLog("✕ " + (e instanceof Error ? e.message : "failed"), "error");
    } finally {
      if (termRef.current) {
        termRef.current.writeln("");
        termRef.current.write("\x1b[90mmaestro\x1b[0m$ ");
      }
      setBusy(false);
    }
  };

  const bots: BotConfig[] = providers.slice(0, 6).map((p, i) => botFor(i, p.id, p.id));

  return (
    <div className="relative flex h-full flex-col overflow-hidden" style={{ background: "#070b12", color: "rgba(220,240,255,0.9)" }}>
      <BackgroundTraces />
      <CircuitDecorations />

      {/* Header */}
      <header className="relative z-20 flex items-center justify-between border-b px-4 py-2 shrink-0"
        style={{ borderColor: THEME.panelBorder, background: "rgba(13,22,39,0.7)", backdropFilter: "blur(8px)" }}>
        <div className="flex items-center gap-2">
          <TermIcon size={14} color={THEME.glow} />
          <span className="text-[11px] font-bold tracking-[3px]" style={{ fontFamily: "'Orbitron',sans-serif", color: THEME.glow }}>
            TERM/SHELL
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px]" style={{ fontFamily: "'Share Tech Mono',monospace" }}>
          <span style={{ color: THEME.glow }}>{bot.name}</span>
          <span style={{ color: "rgba(58,138,208,0.6)" }}>{selection.providerId}</span>
          <span className="flex items-center gap-1" style={{ color: "#FFD700" }}>
            <Trophy size={11} /> Lv.{levelFor(st.xp)} {levelTitle(levelFor(st.xp))} · {st.xp} XP
          </span>
          <button onClick={() => shell.reset()} className="shell-btn p-1 rounded" title="Reset progress"
            style={{ color: "rgba(58,138,208,0.6)" }}>
            <RotateCcw size={12} />
          </button>
        </div>
      </header>

      <div className="relative z-20 flex flex-1 min-h-0">
        {/* Bot rail */}
        <aside className="flex flex-col items-center gap-4 w-[110px] shrink-0 border-r p-3 pt-6 overflow-y-auto"
          style={{ borderColor: THEME.panelBorder, background: "rgba(10,16,28,0.6)" }}>
          {bots.map((b, i) => {
            const active = b.id === bot.id;
            return (
              <button key={b.id} onClick={() => setDeployed(b.id)}
                className={`relative w-[64px] h-[70px] rounded-lg transition-all ${active ? "ring-2" : "opacity-70 hover:opacity-100"} ${busy ? "pointer-events-none" : ""}`}
                style={active ? ({ borderColor: THEME.glow, boxShadow: `0 0 14px ${THEME.glowSoft}` }) : ({ border: `1px solid ${THEME.panelBorder}` })}>
                <RobotAvatar config={b} status={busy ? "working" : "idle"} facing="right" pid={i + 1} selected={active} />
              </button>
            );
          })}
          <button className="mt-auto w-[60px] h-[60px] rounded-lg border border-dashed flex items-center justify-center"
            style={{ borderColor: "rgba(58,138,208,0.3)", color: "rgba(58,138,208,0.5)" }} title="Deploy a new bot">
            <Plus size={16} />
          </button>
        </aside>

        {/* Terminal + input */}
        <main className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 min-h-0 p-2">
            <div className="h-full rounded-lg border overflow-hidden" style={{ borderColor: THEME.panelBorder, background: THEME.termBg }}>
              <div ref={xtermEl} className="h-full w-full" />
            </div>
          </div>
          <div className="flex gap-2 px-2 pb-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runPrompt()}
              placeholder={ready ? "ask anything…" : "no key on the stand — Keys tab"}
              disabled={!ready || busy}
              className="flex-1 rounded-md border bg-black/30 px-3 py-2 text-[12px] outline-none focus:border-current"
              style={{ borderColor: THEME.panelBorder, color: "rgba(220,240,255,0.9)", fontFamily: "'Share Tech Mono',monospace" }}
              autoFocus
            />
            <button onClick={runPrompt} disabled={!ready || busy} className="shell-btn px-4 rounded-md border"
              style={{ borderColor: THEME.glow, color: THEME.glow, background: "rgba(0,212,255,0.08)" }}>
              RUN
            </button>
          </div>
        </main>
      </div>

      {/* Deploy ring hint */}
      <div className={`absolute z-30 bottom-16 left-[128px] text-[10px] transition-opacity ${deployed ? "opacity-100" : "opacity-0"}`}
        style={{ fontFamily: "'Share Tech Mono',monospace", color: THEME.glow }}>
        ▸ {deployed}
      </div>
    </div>
  );
}

function levelFor(xp: number): number {
  return Math.floor(Math.sqrt(xp / 25)) + 1;
}
