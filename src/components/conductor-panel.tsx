import {
  Award,
  CalendarCheck,
  Crown,
  Flame,
  Gauge,
  HeartPulse,
  Music,
  RotateCcw,
  Send,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { THEME } from "@/lib/shell";
import { useShell } from "@/lib/shell-store";
import {
  ACHIEVEMENTS,
  levelProgress,
  levelTitle,
  type AchievementDef,
} from "@/lib/leveling";

const BADGE_ICONS: Record<string, LucideIcon> = {
  first_baton: Sparkles,
  tempo: Gauge,
  repertoire: Music,
  century: Crown,
  heartbeat: HeartPulse,
  wired: Send,
  streak_3: Flame,
  streak_7: CalendarCheck,
  virtuoso: Trophy,
};

const MONO = "'Share Tech Mono', monospace";
const DISPLAY = "'Orbitron', sans-serif";

/** The gamification centerpiece: level ring, XP readout, streak, badge grid. */
export function ConductorPanel() {
  const profile = useShell((s) => s.profile);
  const resetProfile = useShell((s) => s.resetProfile);
  const { level, into, span, pct } = levelProgress(profile.xp);
  const missing = span - into;
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div
      className="flex h-full flex-col gap-5 overflow-y-auto p-4"
      style={{ background: "rgba(10,16,28,0.72)", fontFamily: MONO }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-bold tracking-[3px]"
          style={{ fontFamily: DISPLAY, color: THEME.glow }}
        >
          CONDUCTOR
        </span>
        <button
          type="button"
          onClick={() => (confirmReset ? (resetProfile(), setConfirmReset(false)) : setConfirmReset(true))}
          onBlur={() => setConfirmReset(false)}
          className="shell-btn rounded px-1.5 py-1 text-[9px] tracking-widest"
          style={{ color: confirmReset ? THEME.error : "rgba(58,138,208,0.6)" }}
          title="Reset conductor profile"
        >
          <span className="inline-flex items-center gap-1">
            <RotateCcw size={10} />
            {confirmReset ? "SURE?" : "RESET"}
          </span>
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <LevelRing level={level} pct={pct} />
        <div className="text-center">
          <div className="text-[13px] tracking-[2px]" style={{ color: "rgba(220,240,255,0.95)" }}>
            {levelTitle(level)}
          </div>
          <div className="mt-0.5 text-[10px]" style={{ color: "rgba(58,138,208,0.8)" }}>
            {profile.xp.toLocaleString()} XP · {missing.toLocaleString()} to Lv.{level + 1}
          </div>
        </div>
        <XpBar pct={pct} />
      </div>

      <div className="flex items-center justify-between rounded-md px-3 py-2"
        style={{ border: `1px solid ${THEME.panelBorder}`, background: "rgba(0,212,255,0.04)" }}
      >
        <span className="flex items-center gap-1.5 text-[10px] tracking-widest"
          style={{ color: "rgba(58,138,208,0.85)" }}
        >
          <Flame size={12} color={profile.streakDays > 0 ? "#ffb08a" : "rgba(58,138,208,0.5)"} />
          STREAK
        </span>
        <span className="text-[12px]" style={{ color: "rgba(220,240,255,0.92)" }}>
          {profile.streakDays > 0 ? `${profile.streakDays} day${profile.streakDays === 1 ? "" : "s"}` : "—"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] tracking-[3px]" style={{ fontFamily: DISPLAY, color: THEME.glow }}>
            HONORS
          </span>
          <span className="text-[10px]" style={{ color: "rgba(58,138,208,0.7)" }}>
            {profile.achievements.length}/{ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ACHIEVEMENTS.map((a) => (
            <Badge key={a.id} def={a} unlocked={profile.achievements.includes(a.id)} />
          ))}
        </div>
      </div>

      <XpLedger />
    </div>
  );
}

function LevelRing({ level, pct }: { level: number; pct: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative" style={{ width: 132, height: 132 }}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <defs>
          <linearGradient id="conductor-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6ef3ff" />
            <stop offset="100%" stopColor="#1ba0c8" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(58,138,208,0.18)" strokeWidth="6" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="url(#conductor-ring)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          className="level-ring-live transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[9px] tracking-[3px]" style={{ color: "rgba(58,138,208,0.8)", fontFamily: DISPLAY }}>
          LEVEL
        </span>
        <span
          className="text-3xl font-bold"
          style={{
            color: "#eaf6ff",
            fontFamily: DISPLAY,
            textShadow: "0 0 18px rgba(0,212,255,0.55)",
          }}
        >
          {level}
        </span>
      </div>
    </div>
  );
}

function XpBar({ pct }: { pct: number }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: "rgba(58,138,208,0.16)" }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${Math.max(2, pct * 100)}%`,
          background: "linear-gradient(90deg, #1ba0c8, #6ef3ff)",
          boxShadow: "0 0 8px rgba(0,212,255,0.6)",
        }}
      />
    </div>
  );
}

function Badge({ def, unlocked }: { def: AchievementDef; unlocked: boolean }) {
  const Icon = BADGE_ICONS[def.id] ?? Award;
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-md px-1 py-2.5 text-center ${unlocked ? "badge-unlocked" : ""}`}
      style={{
        border: `1px solid ${unlocked ? "rgba(0,212,255,0.45)" : "rgba(58,138,208,0.14)"}`,
        background: unlocked ? "rgba(0,212,255,0.07)" : "rgba(10,16,28,0.5)",
      }}
      title={unlocked ? def.blurb : `Locked — ${def.hint}`}
    >
      <Icon
        size={17}
        color={unlocked ? "#6ef3ff" : "rgba(58,138,208,0.35)"}
        style={unlocked ? { filter: "drop-shadow(0 0 4px rgba(0,212,255,0.8))" } : undefined}
      />
      <span
        className="text-[8.5px] leading-tight tracking-wider"
        style={{ color: unlocked ? "rgba(220,240,255,0.9)" : "rgba(58,138,208,0.45)" }}
      >
        {unlocked ? def.name : def.hint}
      </span>
    </div>
  );
}

function XpLedger() {
  const profile = useShell((s) => s.profile);
  const rows: { label: string; n: number }[] = [
    { label: "CHAT", n: profile.perSource.chat },
    { label: "SHELL", n: profile.perSource.shell },
    { label: "PULSE", n: profile.perSource.pulse },
    { label: "CHANNELS", n: profile.perSource.channel },
  ];
  return (
    <div className="mt-auto flex flex-col gap-1.5">
      <span className="text-[10px] tracking-[3px]" style={{ fontFamily: DISPLAY, color: THEME.glow }}>
        MOVES · {profile.events}
      </span>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-[10px]"
            style={{ color: "rgba(58,138,208,0.8)" }}
          >
            <span>{r.label}</span>
            <span style={{ color: r.n > 0 ? "rgba(220,240,255,0.9)" : "rgba(58,138,208,0.4)" }}>
              {r.n}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Global level-up / achievement toast. Mount once near the app root. */
export function CelebrationOverlay() {
  const celebration = useShell((s) => s.celebration);
  const dismiss = useShell((s) => s.dismissCelebration);

  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(dismiss, 3400);
    return () => clearTimeout(t);
  }, [celebration, dismiss]);

  if (!celebration) return null;

  const names =
    celebration.kind === "achievement"
      ? celebration.achievementIds
          .map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name)
          .filter(Boolean)
          .join(" · ")
      : null;
  const Icon = celebration.kind === "level" ? Trophy : Award;

  return (
    <button
      type="button"
      onClick={dismiss}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
      aria-label="Dismiss celebration"
    >
      <span className="celebrate-in relative flex flex-col items-center gap-3 rounded-xl px-10 py-8"
        style={{
          border: `1px solid ${THEME.chipBorder}`,
          background: "linear-gradient(180deg, rgba(15,26,46,0.97), rgba(10,16,28,0.97))",
          boxShadow: "0 0 60px rgba(0,212,255,0.35)",
        }}
      >
        <Burst />
        <Icon size={34} color="#FFD700" style={{ filter: "drop-shadow(0 0 10px rgba(255,215,0,0.7))" }} />
        <span className="text-[11px] tracking-[4px]" style={{ fontFamily: DISPLAY, color: THEME.glow }}>
          {celebration.kind === "level" ? "LEVEL UP" : "HONOR EARNED"}
        </span>
        <span className="text-xl font-bold" style={{ fontFamily: DISPLAY, color: "#eaf6ff" }}>
          {celebration.kind === "level"
            ? `Lv.${celebration.level} — ${levelTitle(celebration.level)}`
            : names}
        </span>
        <span className="text-[10px]" style={{ color: "rgba(58,138,208,0.7)" }}>
          tap anywhere to carry on
        </span>
      </span>
    </button>
  );
}

/** A ring of dots blooming outward behind the celebration card. */
function Burst() {
  const dots = Array.from({ length: 12 });
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
      {dots.map((_, i) => {
        const angle = (i / dots.length) * Math.PI * 2;
        const dist = 90 + (i % 3) * 26;
        return (
          <span
            key={i}
            className="celebrate-burst absolute left-1/2 top-1/2 inline-block size-1.5 rounded-full"
            style={{
              background: i % 4 === 0 ? "#FFD700" : "#6ef3ff",
              animationDelay: `${(i % 5) * 70}ms`,
              ["--bx" as string]: `${Math.cos(angle) * dist}px`,
              ["--by" as string]: `${Math.sin(angle) * dist}px`,
            }}
          />
        );
      })}
    </span>
  );
}
