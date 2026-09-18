// Conductor leveling — every XP-earning move in the console (chat turns,
// shell runs, pulse beats, channel messages) feeds ONE profile. Pure math
// lives here; the store that persists and celebrates it is shell-store.ts.

export type XpSource = "chat" | "shell" | "pulse" | "channel" | "mcp";

export type ConductorProfile = {
  xp: number;
  /** Total XP-earning actions across the console. */
  events: number;
  streakDays: number;
  /** Local YYYY-MM-DD of the last awarded action. */
  lastDay: string | null;
  achievements: string[];
  perSource: Record<XpSource, number>;
};

export function blankProfile(): ConductorProfile {
  return {
    xp: 0,
    events: 0,
    streakDays: 0,
    lastDay: null,
    achievements: [],
    perSource: { chat: 0, shell: 0, pulse: 0, channel: 0, mcp: 0 },
  };
}

/** Level curve shared with the shell bots: level n needs 25·(n−1)² XP. */
export function levelOf(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 25)) + 1;
}

export function xpForLevel(level: number): number {
  return 25 * (level - 1) ** 2;
}

export function levelProgress(xp: number): {
  level: number;
  into: number;
  span: number;
  pct: number;
} {
  const level = levelOf(xp);
  const floor = xpForLevel(level);
  const span = xpForLevel(level + 1) - floor;
  const into = Math.max(0, xp - floor);
  return { level, into, span, pct: Math.min(1, into / span) };
}

export const LEVEL_TITLES = ["NOVICE", "EXPERT", "VETERAN", "MASTER", "LEGENDARY"];

export function levelTitle(level: number): string {
  if (level >= 50) return LEVEL_TITLES[4];
  if (level >= 25) return LEVEL_TITLES[3];
  if (level >= 10) return LEVEL_TITLES[2];
  if (level >= 5) return LEVEL_TITLES[1];
  return LEVEL_TITLES[0];
}

export type AchievementDef = {
  id: string;
  name: string;
  blurb: string;
  /** Shown while locked. */
  hint: string;
  test: (p: ConductorProfile) => boolean;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_baton",
    name: "First Baton",
    blurb: "Made the first move in the console.",
    hint: "Do anything once",
    test: (p) => p.events >= 1,
  },
  {
    id: "tempo",
    name: "Tempo",
    blurb: "Ten moves. The orchestra is listening.",
    hint: "Reach 10 moves",
    test: (p) => p.events >= 10,
  },
  {
    id: "repertoire",
    name: "Repertoire",
    blurb: "Fifty moves across the console.",
    hint: "Reach 50 moves",
    test: (p) => p.events >= 50,
  },
  {
    id: "century",
    name: "Century",
    blurb: "One hundred moves conducted.",
    hint: "Reach 100 moves",
    test: (p) => p.events >= 100,
  },
  {
    id: "heartbeat",
    name: "Heartbeat",
    blurb: "Put a model on a cron — a pulse beat for you.",
    hint: "Run one pulse beat",
    test: (p) => p.perSource.pulse >= 1,
  },
  {
    id: "wired",
    name: "Wired In",
    blurb: "A channel carried a message to Maestro.",
    hint: "Get a channel message",
    test: (p) => p.perSource.channel >= 1,
  },
  {
    id: "streak_3",
    name: "On a Roll",
    blurb: "Showed up three days running.",
    hint: "3-day streak",
    test: (p) => p.streakDays >= 3,
  },
  {
    id: "streak_7",
    name: "Standing Ovation",
    blurb: "A week without missing a beat.",
    hint: "7-day streak",
    test: (p) => p.streakDays >= 7,
  },
  {
    id: "virtuoso",
    name: "Virtuoso",
    blurb: "A thousand XP of conducting.",
    hint: "Earn 1,000 XP",
    test: (p) => p.xp >= 1000,
  },
];

export function earnedAchievements(p: ConductorProfile): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(p)).map((a) => a.id);
}

/** Roll the streak forward for an action happening at `now`. */
export function streakFor(p: ConductorProfile, now: Date): {
  streakDays: number;
  lastDay: string;
} {
  const day = localDay(now);
  if (p.lastDay === day) return { streakDays: p.streakDays, lastDay: day };
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = localDay(y);
  return {
    streakDays: p.lastDay === yesterday ? p.streakDays + 1 : 1,
    lastDay: day,
  };
}

function localDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function isProfile(v: unknown): v is ConductorProfile {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<ConductorProfile>;
  return (
    typeof p.xp === "number" &&
    typeof p.events === "number" &&
    typeof p.streakDays === "number" &&
    Array.isArray(p.achievements) &&
    !!p.perSource &&
    typeof p.perSource === "object"
  );
}
