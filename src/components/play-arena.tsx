import { Bot, Pause, Play, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as PE } from "react";
import { searchCatalog } from "@/lib/catalog";
import { streamChat } from "@/lib/chat";
import { useMaestro } from "@/lib/store";
import type { CatalogIndex } from "@/lib/types";
import { cn, formatTokens } from "@/lib/utils";

type Kind = "in" | "out" | "dim";
type Line = { kind: Kind; text: string };

type Unit = {
  id: string;
  name: string;
  lines: Line[];
  draft: string;
  busy: boolean;
};

type Body = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const RW = 152;
const RH = 176;
const MAX = 6;
const HELP = `square terminal
  help              this list
  clear             wipe the screen
  echo <text>       print
  models [q]        search the stand
  which             current model
  ask <prompt>      stream a reply
  ping              bounce harder
  still / go        freeze this unit
  name <id>         rename`;

function boot(name: string, n: number): Line[] {
  return [
    { kind: "dim", text: `maestro play  ·  ${name}` },
    { kind: "dim", text: `unit ${String(n).padStart(2, "0")} on the floor` },
    { kind: "out", text: "type help" },
  ];
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function PlayArena({ index, active }: { index: CatalogIndex; active: boolean }) {
  const { selection, keys } = useMaestro();
  const floorRef = useRef<HTMLDivElement>(null);
  const bodies = useRef<Map<string, Body>>(new Map());
  const nodes = useRef<Map<string, HTMLDivElement>>(new Map());
  const seq = useRef(0);
  const grab = useRef<{
    id: string;
    dx: number;
    dy: number;
    lx: number;
    ly: number;
    lt: number;
    moved: boolean;
  } | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [reduce, setReduce] = useState(false);
  const frozenRef = useRef(false);
  const focusRef = useRef<string | null>(null);
  const reduceRef = useRef(false);

  const unitsRef = useRef<Unit[]>([]);
  unitsRef.current = units;
  const activeRef = useRef(active);
  activeRef.current = active;
  frozenRef.current = frozen;
  focusRef.current = focus;
  reduceRef.current = reduce;

  const ready =
    Boolean(keys[selection.providerId]) ||
    (selection.providerId === "xai" && index.xaiReady);

  const place = useCallback((id: string, w: number, h: number): Body => {
    const pad = 8;
    return {
      id,
      x: rand(pad, Math.max(pad, w - RW - pad)),
      y: rand(pad, Math.max(pad, h - RH - pad)),
      vx: rand(40, 90) * (Math.random() < 0.5 ? -1 : 1),
      vy: rand(40, 80) * (Math.random() < 0.5 ? -1 : 1),
    };
  }, []);

  const spawn = useCallback(
    (count = 1) => {
      const floor = floorRef.current;
      const w = floor?.clientWidth ?? 800;
      const h = floor?.clientHeight ?? 600;
      setUnits((prev) => {
        const room = Math.max(0, MAX - prev.length);
        const n = Math.min(count, room);
        if (!n) return prev;
        const next = [...prev];
        for (let i = 0; i < n; i++) {
          seq.current += 1;
          const id = crypto.randomUUID();
          const name = `M-${String(seq.current).padStart(2, "0")}`;
          next.push({ id, name, lines: boot(name, seq.current), draft: "", busy: false });
          bodies.current.set(id, place(id, w, h));
        }
        return next;
      });
    },
    [place],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduce(mq.matches);
      reduceRef.current = mq.matches;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!active) return;
    const floor = floorRef.current;
    const w = Math.max(floor?.clientWidth ?? 0, 320);
    const h = Math.max(floor?.clientHeight ?? 0, 240);
    setUnits((prev) => {
      if (prev.length) return prev;
      const next: Unit[] = [];
      for (let i = 0; i < 3; i++) {
        seq.current += 1;
        const id = crypto.randomUUID();
        const name = `M-${String(seq.current).padStart(2, "0")}`;
        next.push({
          id,
          name,
          lines: boot(name, seq.current),
          draft: "",
          busy: false,
        });
        bodies.current.set(id, place(id, w, h));
      }
      return next;
    });
  }, [active, place]);

  useEffect(() => {
    const floor = floorRef.current;
    if (!floor) return;
    const ro = new ResizeObserver(() => {
      const W = floor.clientWidth;
      const H = floor.clientHeight;
      if (W < 32 || H < 32) return;
      for (const b of bodies.current.values()) {
        b.x = Math.min(Math.max(0, b.x), Math.max(0, W - RW));
        b.y = Math.min(Math.max(0, b.y), Math.max(0, H - RH));
      }
    });
    ro.observe(floor);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const floor = floorRef.current;
      if (!floor) return;
      const W = floor.clientWidth;
      const H = floor.clientHeight;
      if (W < 32 || H < 32) return;
      const list = [...bodies.current.values()];
      const still = frozenRef.current || reduceRef.current;
      const held = grab.current?.id ?? null;
      const focused = focusRef.current;

      if (!still) {
        for (const b of list) {
          if (b.id === held) continue;
          const rest = b.id === focused ? 0.25 : 1;
          b.x += b.vx * dt * rest;
          b.y += b.vy * dt * rest;
          if (b.x <= 0) {
            b.x = 0;
            b.vx = Math.abs(b.vx);
          } else if (b.x + RW >= W) {
            b.x = Math.max(0, W - RW);
            b.vx = -Math.abs(b.vx);
          }
          if (b.y <= 0) {
            b.y = 0;
            b.vy = Math.abs(b.vy);
          } else if (b.y + RH >= H) {
            b.y = Math.max(0, H - RH);
            b.vy = -Math.abs(b.vy);
          }
        }
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];
            if (a.id === held || b.id === held) continue;
            const ox = a.x + RW / 2 - (b.x + RW / 2);
            const oy = a.y + RH / 2 - (b.y + RH / 2);
            const dx = RW - Math.abs(ox);
            const dy = RH - Math.abs(oy);
            if (dx > 0 && dy > 0) {
              if (dx < dy) {
                const s = ox > 0 ? dx / 2 : -dx / 2;
                a.x += s;
                b.x -= s;
                const vx = a.vx;
                a.vx = b.vx;
                b.vx = vx;
              } else {
                const s = oy > 0 ? dy / 2 : -dy / 2;
                a.y += s;
                b.y -= s;
                const vy = a.vy;
                a.vy = b.vy;
                b.vy = vy;
              }
            }
          }
        }
      }

      for (const b of list) {
        const el = nodes.current.get(b.id);
        if (el) el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  function patch(id: string, fn: (u: Unit) => Unit) {
    setUnits((prev) => prev.map((u) => (u.id === id ? fn(u) : u)));
  }

  function write(id: string, ...next: Line[]) {
    patch(id, (u) => ({ ...u, lines: [...u.lines, ...next].slice(-48) }));
  }

  function ping(id: string) {
    const b = bodies.current.get(id);
    if (!b) return;
    b.vx = (b.vx < 0 ? -1 : 1) * rand(120, 180);
    b.vy = (b.vy < 0 ? -1 : 1) * rand(100, 160);
    write(id, { kind: "dim", text: "ping" });
  }

  async function exec(id: string, raw: string) {
    const input = raw.trim();
    if (!input) return;
    const unit = unitsRef.current.find((u) => u.id === id);
    if (!unit || unit.busy) return;
    write(id, { kind: "in", text: `› ${input}` });
    patch(id, (u) => ({ ...u, draft: "" }));
    const [cmd, ...rest] = input.split(/\s+/);
    const arg = rest.join(" ");
    switch (cmd) {
      case "help":
      case "?":
        write(id, { kind: "out", text: HELP });
        break;
      case "clear":
        patch(id, (u) => ({ ...u, lines: [] }));
        break;
      case "echo":
        write(id, { kind: "out", text: arg || "" });
        break;
      case "ping":
        ping(id);
        break;
      case "still": {
        const b = bodies.current.get(id);
        if (b) b.vx = b.vy = 0;
        write(id, { kind: "dim", text: "still" });
        break;
      }
      case "go": {
        const b = bodies.current.get(id);
        if (b) {
          b.vx = rand(40, 90) * (Math.random() < 0.5 ? -1 : 1);
          b.vy = rand(40, 80) * (Math.random() < 0.5 ? -1 : 1);
        }
        write(id, { kind: "dim", text: "go" });
        break;
      }
      case "name":
        if (!arg) {
          write(id, { kind: "dim", text: "usage: name <id>" });
          break;
        }
        patch(id, (u) => ({ ...u, name: arg.slice(0, 12) }));
        write(id, { kind: "out", text: `name → ${arg.slice(0, 12)}` });
        break;
      case "which":
        write(
          id,
          {
            kind: "out",
            text: `${selection.providerId}/${selection.modelId}`,
          },
        );
        break;
      case "models": {
        const r = await searchCatalog({ data: { q: arg, chatOnly: true, limit: 8 } });
        write(
          id,
          {
            kind: "out",
            text:
              r.results
                .map((m) => `${m.providerId}/${m.id}  ${formatTokens(m.context)}`)
                .join("\n") || "none",
          },
        );
        break;
      }
      case "ask":
        if (!arg) {
          write(id, { kind: "dim", text: "usage: ask <prompt>" });
          break;
        }
        if (!ready) {
          write(id, { kind: "dim", text: "no key on the stand. Keys tab." });
          break;
        }
        patch(id, (u) => ({ ...u, busy: true }));
        write(id, { kind: "out", text: "" });
        try {
          await streamChat(
            {
              providerId: selection.providerId,
              modelId: selection.modelId,
              messages: [{ role: "user", content: arg.slice(0, 500) }],
              temperature: 0.7,
              maxTokens: 160,
              apiKey: keys[selection.providerId] || undefined,
            },
            (text) => {
              patch(id, (u) => {
                const lines = u.lines.slice();
                const last = lines[lines.length - 1];
                if (last && last.kind === "out") {
                  lines[lines.length - 1] = { kind: "out", text };
                } else {
                  lines.push({ kind: "out", text });
                }
                return { ...u, lines: lines.slice(-48) };
              });
            },
          );
        } catch (e) {
          write(id, { kind: "dim", text: e instanceof Error ? e.message : "ask failed" });
        } finally {
          patch(id, (u) => ({ ...u, busy: false }));
        }
        break;
      default:
        write(id, { kind: "dim", text: `unknown: ${cmd}  (help)` });
    }
  }

  function onDown(id: string, e: PE<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("input,button,pre")) return;
    const b = bodies.current.get(id);
    const floor = floorRef.current;
    if (!b || !floor) return;
    const rect = floor.getBoundingClientRect();
    grab.current = {
      id,
      dx: e.clientX - rect.left - b.x,
      dy: e.clientY - rect.top - b.y,
      lx: e.clientX,
      ly: e.clientY,
      lt: performance.now(),
      moved: false,
    };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setFocus(id);
  }

  function onMove(e: PE<HTMLDivElement>) {
    const g = grab.current;
    const floor = floorRef.current;
    if (!g || !floor) return;
    const b = bodies.current.get(g.id);
    if (!b) return;
    const rect = floor.getBoundingClientRect();
    const nx = e.clientX - rect.left - g.dx;
    const ny = e.clientY - rect.top - g.dy;
    const now = performance.now();
    const dt = Math.max(0.008, (now - g.lt) / 1000);
    if (Math.hypot(e.clientX - g.lx, e.clientY - g.ly) > 3) g.moved = true;
    b.vx = (nx - b.x) / dt;
    b.vy = (ny - b.y) / dt;
    b.x = Math.min(Math.max(0, nx), Math.max(0, floor.clientWidth - RW));
    b.y = Math.min(Math.max(0, ny), Math.max(0, floor.clientHeight - RH));
    g.lx = e.clientX;
    g.ly = e.clientY;
    g.lt = now;
    const el = nodes.current.get(g.id);
    if (el) el.style.transform = `translate(${b.x}px, ${b.y}px)`;
  }

  function onUp() {
    const g = grab.current;
    if (g) {
      const b = bodies.current.get(g.id);
      if (b && g.moved) {
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 420) {
          const s = 420 / sp;
          b.vx *= s;
          b.vy *= s;
        }
      } else if (b && !g.moved) {
        b.vx = 0;
        b.vy = 0;
      }
    }
    grab.current = null;
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-bg">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
        <Bot className="size-4 text-muted" />
        <p className="font-display text-lg italic tracking-tight">Play</p>
        <p className="hidden text-micro text-subtle sm:block">
          square units · each a terminal · drag to throw
        </p>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted hover:text-fg"
            onClick={() => setFrozen((v) => !v)}
          >
            {frozen ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {frozen ? "Go" : "Still"}
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-elevated px-2.5 text-xs text-fg disabled:opacity-40"
            disabled={units.length >= MAX}
            onClick={() => spawn(1)}
          >
            <Plus className="size-3.5" />
            Robot
          </button>
        </div>
      </div>

      <div
        ref={floorRef}
        className="play-floor relative min-h-0 flex-1 overflow-hidden"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setFocus(null);
        }}
      >
        {units.length === 0 ? (
          <div className="flex h-full flex-col items-start justify-center gap-4 px-6">
            <p className="font-display text-3xl italic tracking-tight">Empty floor.</p>
            <button
              type="button"
              className="h-10 rounded-md bg-accent px-4 text-xs font-medium text-accent-fg"
              onClick={() => spawn(3)}
            >
              Release three
            </button>
          </div>
        ) : null}
        {units.map((u) => (
          <RobotCard
            key={u.id}
            unit={u}
            focused={focus === u.id}
            onBind={(el) => {
              if (el) {
                nodes.current.set(u.id, el);
                const b = bodies.current.get(u.id);
                if (b) el.style.transform = `translate(${b.x}px, ${b.y}px)`;
              } else nodes.current.delete(u.id);
            }}
            onDown={onDown}
            onMove={onMove}
            onUp={onUp}
            onDraft={(v) => patch(u.id, (x) => ({ ...x, draft: v }))}
            onSubmit={() => void exec(u.id, u.draft)}
            onClose={() => {
              bodies.current.delete(u.id);
              nodes.current.delete(u.id);
              setUnits((prev) => prev.filter((x) => x.id !== u.id));
              if (focus === u.id) setFocus(null);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function RobotCard({
  unit,
  focused,
  onBind,
  onDown,
  onMove,
  onUp,
  onDraft,
  onSubmit,
  onClose,
}: {
  unit: Unit;
  focused: boolean;
  onBind: (el: HTMLDivElement | null) => void;
  onDown: (id: string, e: PE<HTMLDivElement>) => void;
  onMove: (e: PE<HTMLDivElement>) => void;
  onUp: () => void;
  onDraft: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const scroller = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [unit.lines, unit.busy]);

  return (
    <div
      ref={onBind}
      className={cn(
        "absolute top-0 left-0 will-change-transform",
        focused ? "z-10" : "z-0",
      )}
      style={{ width: RW, height: RH }}
      onPointerDown={(e) => onDown(unit.id, e)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        className={cn(
          "relative h-full w-full text-fg",
          focused ? "text-fg" : "text-muted",
        )}
      >
        <SquareBot active={focused} busy={unit.busy} />
        <div
          className="absolute overflow-hidden bg-bg text-fg"
          style={{ left: "16%", top: "24.5%", width: "68%", height: "44%" }}
        >
          <pre
            ref={scroller}
            className="h-full overflow-auto px-1.5 py-1 text-tiny leading-snug text-muted"
          >
            {unit.lines.map((l, i) => (
              <span
                key={`${i}-${l.text.slice(0, 8)}`}
                className={cn(
                  "block whitespace-pre-wrap",
                  l.kind === "in" ? "text-fg" : l.kind === "dim" ? "text-subtle" : "text-muted",
                )}
              >
                {l.text}
              </span>
            ))}
            {unit.busy ? <span className="maestro-caret" /> : null}
          </pre>
        </div>
        <div
          className="absolute flex items-center gap-1 px-0.5"
          style={{ left: "16%", top: "70%", width: "68%", height: "9%" }}
        >
          <span className="text-tiny text-subtle">›</span>
          <input
            value={unit.draft}
            suppressHydrationWarning
            disabled={unit.busy}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder={focused ? "ask / ping / help" : ""}
            className="h-full min-w-0 flex-1 bg-transparent text-tiny text-fg placeholder:text-subtle focus:outline-none"
          />
        </div>
        <div
          className="pointer-events-none absolute flex items-center justify-between px-2"
          style={{ left: "10%", top: "17%", width: "80%", height: "7%" }}
        >
          <span className="text-tiny tracking-wide text-fg">{unit.name}</span>
        </div>
        {focused ? (
          <button
            type="button"
            aria-label={`Remove ${unit.name}`}
            className="absolute top-3 right-2 inline-flex size-6 items-center justify-center rounded-xs text-subtle hover:text-fg"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SquareBot({ active, busy }: { active: boolean; busy: boolean }) {
  return (
    <svg viewBox="0 0 100 116" className="h-full w-full" aria-hidden="true">
      <rect x="46" y="2" width="8" height="14" fill="currentColor" />
      <rect x="42" y="0" width="16" height="6" fill="currentColor" />
      <rect
        x="8"
        y="16"
        width="84"
        height="86"
        fill="var(--color-surface)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="0"
        y="46"
        width="8"
        height="18"
        fill="var(--color-elevated)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="92"
        y="46"
        width="8"
        height="18"
        fill="var(--color-elevated)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="16"
        y="20"
        width="8"
        height="6"
        fill={busy ? "var(--color-ok)" : active ? "var(--color-fg)" : "var(--color-subtle)"}
      />
      <rect
        x="16"
        y="28"
        width="68"
        height="52"
        fill="var(--color-bg)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="16"
        y="82"
        width="68"
        height="12"
        fill="var(--color-elevated)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect x="18" y="102" width="26" height="12" fill="currentColor" />
      <rect x="56" y="102" width="26" height="12" fill="currentColor" />
    </svg>
  );
}
