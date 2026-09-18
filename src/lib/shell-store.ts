import { create } from "zustand";
import { levelOf } from "@/lib/shell";
import {
  ACHIEVEMENTS,
  blankProfile,
  earnedAchievements,
  isProfile,
  streakFor,
  type ConductorProfile,
  type XpSource,
} from "@/lib/leveling";

// Gamification for Maestro: per-robot shell stats (the Term/Shell view bots)
// plus ONE conductor profile fed by every XP-earning move in the console —
// chat turns, shell runs, pulse beats, channel messages. All localStorage.
type RobotState = {
  pid: number;
  name: string;
  xp: number;
  commands: number;
  uptime: number;
  achievements: string[];
};

export type Celebration =
  | { kind: "level"; at: number; level: number }
  | { kind: "achievement"; at: number; achievementIds: string[] };

export type AwardResult = {
  xpGained: number;
  newLevel: number | null;
  newAchievements: string[];
};

type ShellState = {
  robots: Record<string, RobotState>;
  recordCommand: (name: string, baseXp?: number) => { xpGained: number; newLevel: number | null; achievement: string | null };
  getState: (name: string) => RobotState;
  reset: () => void;

  profile: ConductorProfile;
  award: (source: XpSource, baseXp?: number) => AwardResult;
  celebration: Celebration | null;
  dismissCelebration: () => void;
  resetProfile: () => void;
};

const KEY = "maestro.shell.robots";
const PROFILE_KEY = "maestro.conductor";

function nextPid(): number {
  return 1000 + Math.floor(Math.random() * 8999);
}

function readRobots(): Record<string, RobotState> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, RobotState>;
  } catch {
    /* ignore */
  }
  return {};
}

function readProfile(): ConductorProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return blankProfile();
    const parsed = JSON.parse(raw) as unknown;
    if (!isProfile(parsed)) return blankProfile();
    // Merge over a blank so new sources added later never read undefined.
    const base = blankProfile();
    return {
      ...base,
      ...parsed,
      perSource: { ...base.perSource, ...parsed.perSource },
    };
  } catch {
    return blankProfile();
  }
}

function persistProfile(p: ConductorProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export const useShell = create<ShellState>((set, get) => ({
  robots: typeof window === "undefined" ? {} : readRobots(),

  recordCommand: (name, baseXp = 10) => {
    const robots = { ...get().robots };
    const prev = robots[name] || {
      pid: nextPid(),
      name,
      xp: 0,
      commands: 0,
      uptime: 0,
      achievements: [],
    };
    const xpGained = Math.round(baseXp * (0.8 + Math.random() * 0.5));
    const xp = prev.xp + xpGained;
    const commands = prev.commands + 1;
    const before = levelOf(prev.xp);
    const after = levelOf(xp);
    const newLevel = after > before ? after : null;

    let achievement: string | null = null;
    if (!prev.achievements.includes("FIRST_CONDUCT") && commands >= 1) {
      achievement = "FIRST_CONDUCT";
    } else if (!prev.achievements.includes("CONDUCTOR") && commands >= 5) {
      achievement = "CONDUCTOR";
    } else if (!prev.achievements.includes("MAESTRO") && commands >= 15) {
      achievement = "MAESTRO";
    } else if (!prev.achievements.includes("VIRTUOSO") && commands >= 40) {
      achievement = "VIRTUOSO";
    } else if (!prev.achievements.includes("SYMPHONY") && commands >= 100) {
      achievement = "SYMPHONY";
    }

    const achievements = achievement && !prev.achievements.includes(achievement)
      ? [...prev.achievements, achievement]
      : prev.achievements;

    robots[name] = { ...prev, xp, commands, achievements };
    set({ robots });
    try {
      localStorage.setItem(KEY, JSON.stringify(robots));
    } catch {
      /* ignore */
    }
    return { xpGained, newLevel, achievement };
  },

  getState: (name) => {
    const r = get().robots[name];
    return r || { pid: nextPid(), name, xp: 0, commands: 0, uptime: 0, achievements: [] };
  },

  reset: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    set({ robots: {} });
  },

  profile: typeof window === "undefined" ? blankProfile() : readProfile(),

  award: (source, baseXp = 10) => {
    const prev = get().profile;
    const xpGained = Math.round(baseXp * (0.85 + Math.random() * 0.4));
    const streak = streakFor(prev, new Date());
    const profile: ConductorProfile = {
      ...prev,
      xp: prev.xp + xpGained,
      events: prev.events + 1,
      streakDays: streak.streakDays,
      lastDay: streak.lastDay,
      perSource: {
        ...prev.perSource,
        [source]: (prev.perSource[source] ?? 0) + 1,
      },
    };

    const beforeLevel = levelOf(prev.xp);
    const afterLevel = levelOf(profile.xp);
    const newLevel = afterLevel > beforeLevel ? afterLevel : null;
    const earned = earnedAchievements(profile);
    const newAchievements = earned.filter((id) => !prev.achievements.includes(id));
    profile.achievements = earned;

    let celebration: Celebration | null = null;
    if (newLevel) celebration = { kind: "level", at: Date.now(), level: newLevel };
    else if (newAchievements.length)
      celebration = { kind: "achievement", at: Date.now(), achievementIds: newAchievements };

    set({ profile, celebration: celebration ?? get().celebration });
    persistProfile(profile);
    return { xpGained, newLevel, newAchievements };
  },

  celebration: null,
  dismissCelebration: () => set({ celebration: null }),

  resetProfile: () => {
    try {
      localStorage.removeItem(PROFILE_KEY);
    } catch {
      /* ignore */
    }
    set({ profile: blankProfile(), celebration: null });
  },
}));

export { ACHIEVEMENTS };
