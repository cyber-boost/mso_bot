// Client side of Channels: the console keeps each channel's token here
// (server lists never include them) and remembers the last message id seen
// per channel, so new inbound messages can award XP once.

import { create } from "zustand";

export type ChannelSummary = {
  id: string;
  name: string;
  created_at: string;
  last_message_at: string | null;
  message_count: number;
};

export type ChannelMessage = {
  id: number;
  role: "in" | "out";
  content: string;
  created_at: string;
};

const TOKENS_KEY = "maestro.channels.tokens";
const SEEN_KEY = "maestro.channels.seen";

type ChannelsState = {
  hydrated: boolean;
  tokens: Record<string, string>;
  lastSeen: Record<string, number>;
  hydrate: () => void;
  saveToken: (id: string, token: string) => void;
  dropChannel: (id: string) => void;
  markSeen: (id: string, upTo: number) => void;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export const useChannels = create<ChannelsState>((set) => ({
  hydrated: false,
  tokens: {},
  lastSeen: {},
  hydrate: () => {
    if (typeof window === "undefined") return;
    set({
      hydrated: true,
      tokens: readJson<Record<string, string>>(TOKENS_KEY, {}),
      lastSeen: readJson<Record<string, number>>(SEEN_KEY, {}),
    });
  },
  saveToken: (id, token) =>
    set((s) => {
      const tokens = { ...s.tokens, [id]: token };
      // A channel born in this console starts its XP watch at zero — every
      // message it ever receives counts as fresh.
      const lastSeen = { ...s.lastSeen, [id]: s.lastSeen[id] ?? 0 };
      writeJson(TOKENS_KEY, tokens);
      writeJson(SEEN_KEY, lastSeen);
      return { tokens, lastSeen };
    }),
  dropChannel: (id) =>
    set((s) => {
      const tokens = { ...s.tokens };
      const lastSeen = { ...s.lastSeen };
      delete tokens[id];
      delete lastSeen[id];
      writeJson(TOKENS_KEY, tokens);
      writeJson(SEEN_KEY, lastSeen);
      return { tokens, lastSeen };
    }),
  markSeen: (id, upTo) =>
    set((s) => {
      const lastSeen = { ...s.lastSeen, [id]: upTo };
      writeJson(SEEN_KEY, lastSeen);
      return { lastSeen };
    }),
}));

export async function fetchChannels(): Promise<ChannelSummary[]> {
  const res = await fetch("/api/channels");
  const j = (await res.json()) as { channels?: ChannelSummary[]; error?: string };
  if (!res.ok) throw new Error(j.error || `List failed (${res.status})`);
  return j.channels ?? [];
}

export async function fetchThread(
  id: string,
  token: string,
): Promise<{ name: string; messages: ChannelMessage[] }> {
  const res = await fetch(`/api/channels/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
  const j = (await res.json()) as {
    channel?: { name: string };
    messages?: ChannelMessage[];
    error?: string;
  };
  if (!res.ok) throw new Error(j.error || `Thread failed (${res.status})`);
  return { name: j.channel?.name ?? "Channel", messages: j.messages ?? [] };
}

export async function sendToChannel(
  id: string,
  token: string,
  text: string,
): Promise<string> {
  const res = await fetch(`/api/channels/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, text }),
  });
  const j = (await res.json()) as { reply?: string; error?: string };
  if (!res.ok) throw new Error(j.error || `Send failed (${res.status})`);
  return j.reply ?? "";
}
