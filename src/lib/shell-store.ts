import { create } from "zustand";
import { levelOf } from "@/lib/shell";

// Lightweight gamification for the Term/Shell view — XP/levels/achievements in
// localStorage, driven by real chat turns. No PTY/backend dependency.
type RobotState = {
  pid: number;
  name: string;
  xp: number;
  commands: number;
  uptime: number;
  achievements: string[];
};

type ShellState = {
  robots: Record<string, RobotState>;
  recordCommand: (name: string, baseXp?: number) => { xpGained: number; newLevel: number | null; achievement: string | null };
  getState: (name: string) => RobotState;
  reset: () => void;
};

const KEY = "maestro.shell.robots";
const ACHIEVEMENTS = ["FIRST_CONDUCT", "CONDUCTOR", "MAESTRO", "VIRTUOSO", "SYMPHONY"];

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

export const useShell = create<ShellState>((set, get) => ({
  robots: readRobots(),

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
}));
