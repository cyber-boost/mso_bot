// Shell theme + entity contract for the Maestro "Term/Shell" UI.
// These match the `THEME` and robot-bot types used by the shell components
// (RobotAvatar, Terminal, GamificationPanel, etc.) that came out of the
// original Nebula console, re-sourced onto Maestro.

export type ShellTheme = {
  glow: string;
  glowSoft: string;
  error: string;
  warn: string;
  outline: string;
  panelBorder: string;
  eye: string;
  eye2: string;
  trace: string;
  chipBorder: string;
  termBg: string;
  termHeader: string;
};

export const THEME: ShellTheme = {
  glow: "rgba(0, 212, 255, 0.9)", // electric cyan
  glowSoft: "rgba(0, 212, 255, 0.18)",
  error: "rgba(220, 90, 90, 0.95)",
  warn: "rgba(220, 180, 60, 0.95)",
  outline: "#0f1a2e",
  panelBorder: "rgba(0, 212, 255, 0.14)",
  eye: "#6ef3ff",
  eye2: "#1ba0c8",
  trace: "rgba(58, 138, 208, 0.22)",
  chipBorder: "rgba(0, 212, 255, 0.35)",
  termBg: "#0b1018",
  termHeader: "rgba(13, 22, 39, 0.9)",
};

export type RobotStatus = "idle" | "booting" | "working" | "error" | "success";

export type BotConfig = {
  id: string;
  name: string;
  provider?: string;
  model?: string;
  head: string;
  body: string;
  antennaBall: string;
  accent: string;
  fem?: boolean;
};

export type LogEntry = {
  id: string;
  pid: number;
  level: "info" | "warn" | "error" | "success";
  timestamp: string;
  message: string;
};

export type RobotEntity = {
  id: string;
  pid: number;
  config: BotConfig;
  status: RobotStatus;
  sessionId?: string;
};

export type GamifiedSession = {
  session_id: string;
  robot_name: string;
  experience_points: number;
  level: number;
  achievements: string[];
  commands_executed: number;
  uptime_seconds: number;
};

export type LeaderboardEntry = {
  robot_name: string;
  experience_points: number;
  level: number;
  commands_executed: number;
  uptime_seconds: number;
};

export const LEVEL_TITLES = ["NOVICE", "EXPERT", "VETERAN", "MASTER", "LEGENDARY"];

export function levelOf(xp: number): number {
  return Math.floor(Math.sqrt(xp / 25)) + 1;
}

export function levelTitle(level: number): string {
  if (level >= 50) return LEVEL_TITLES[4];
  if (level >= 25) return LEVEL_TITLES[3];
  if (level >= 10) return LEVEL_TITLES[2];
  if (level >= 5) return LEVEL_TITLES[1];
  return LEVEL_TITLES[0];
}
