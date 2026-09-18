// Channel watcher — the console-side background loop that notices inbound
// channel messages (phone, Shortcuts, webhooks) and awards XP for them, no
// matter which view you're on. Mounted once next to the pulse engine.

import { fetchChannels, fetchThread, useChannels } from "./channels";
import { useShell } from "./shell-store";

const POLL_MS = 8_000;
let timer: ReturnType<typeof setInterval> | null = null;

export function startChannelWatch(): void {
  if (typeof window === "undefined" || timer) return;
  useChannels.getState().hydrate();
  timer = setInterval(() => {
    void tick();
  }, POLL_MS);
  void tick();
}

export function stopChannelWatch(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

let busy = false;
async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const { tokens, lastSeen, markSeen } = useChannels.getState();
    const ids = Object.keys(tokens);
    if (!ids.length) return;
    const list = await fetchChannels();
    for (const c of list) {
      const token = tokens[c.id];
      if (!token) continue;
      try {
        const t = await fetchThread(c.id, token);
        const inbound = t.messages.filter((m) => m.role === "in");
        const maxId = inbound.reduce((m, x) => Math.max(m, x.id), 0);
        const seen = lastSeen[c.id];
        if (seen === undefined) {
          // First sighting of this channel in this browser — adopt the current
          // high-water mark without awarding XP for ancient history.
          markSeen(c.id, maxId);
        } else if (maxId > seen) {
          const fresh = inbound.filter((m) => m.id > seen).length;
          const award = useShell.getState().award;
          for (let i = 0; i < fresh; i++) award("channel", 10);
          markSeen(c.id, maxId);
        }
      } catch {
        /* one thread's hiccup shouldn't stall the rest */
      }
    }
  } catch {
    /* list failed — try again next tick */
  } finally {
    busy = false;
  }
}
