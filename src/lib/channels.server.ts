// Server side of Channels: storage + Maestro's reply. Self-hosted, no
// accounts — a channel belongs to whoever holds its token, so the token is
// returned exactly once (at creation) and never listed again.

import { getSql } from "@/lib/db";
import type { ChatMessage } from "@/lib/protocol";
import { chatPath, openaiBody, resolveBaseUrl } from "@/lib/protocol";

export type ChannelRow = {
  id: string;
  name: string;
  created_at: string;
  last_message_at: string | null;
  message_count: number;
};

export type ChannelMessageRow = {
  id: number;
  role: "in" | "out";
  content: string;
  created_at: string;
};

export function newChannelId(): string {
  return `ch-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export function newChannelToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export async function listChannels(): Promise<ChannelRow[]> {
  const sql = await getSql();
  const rows = await sql`
    select c.id, c.name, c.created_at::text as created_at,
           max(m.created_at)::text as last_message_at,
           count(m.id)::int as message_count
    from channel c
    left join channel_message m on m.channel_id = c.id
    group by c.id
    order by c.created_at desc
  `;
  return rows as unknown as ChannelRow[];
}

export async function createChannel(
  id: string,
  name: string,
  token: string,
): Promise<void> {
  const sql = await getSql();
  await sql`insert into channel (id, name, token) values (${id}, ${name}, ${token})`;
}

export async function deleteChannel(id: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from channel where id = ${id}`;
}

export async function channelByToken(
  id: string,
  token: string,
): Promise<{ id: string; name: string } | null> {
  const sql = await getSql();
  const rows = await sql`
    select id, name from channel where id = ${id} and token = ${token}
  `;
  return (rows[0] as { id: string; name: string } | undefined) ?? null;
}

export async function addMessage(
  channelId: string,
  role: "in" | "out",
  content: string,
): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into channel_message (channel_id, role, content)
    values (${channelId}, ${role}, ${content})
  `;
  // Keep threads bounded — oldest beyond 200 per channel fall away.
  await sql`
    delete from channel_message
    where channel_id = ${channelId}
      and id not in (
        select id from channel_message
        where channel_id = ${channelId}
        order by id desc
        limit 200
      )
  `;
}

export async function recentMessages(
  channelId: string,
  limit = 50,
): Promise<ChannelMessageRow[]> {
  const sql = await getSql();
  const rows = await sql`
    select id, role, content, created_at::text as created_at
    from channel_message
    where channel_id = ${channelId}
    order by id desc
    limit ${Math.min(Math.max(limit, 1), 200)}
  `;
  return (rows as unknown as ChannelMessageRow[]).reverse();
}

// ---------------------------------------------------------------------------

const CHANNEL_SYSTEM = `You are Maestro, an AI model console, speaking through a messaging channel while the user is away from their desk. Keep replies short and complete — this lands on a phone. Skip preamble. Plain text only, no markdown tables.`;

/** Maestro's side of the conversation: last exchanges as context, then a reply. */
export async function channelReply(
  channelName: string,
  history: ChannelMessageRow[],
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return "Maestro got your message, but this server has no XAI_API_KEY configured, so I can't compose a reply. Set it and ping me again.";
  }

  const { resolveForChat } = await import("@/lib/catalog-load.server");
  const resolved =
    (await resolveForChat("xai", "grok-4-1-fast-non-reasoning")) ??
    (await resolveForChat("xai", "grok-4.5")) ??
    (await resolveForChat("xai", "grok-3-mini"));
  if (!resolved) return "No xAI model is available on this console right now.";
  const { provider, model } = resolved;
  const base = resolveBaseUrl(provider.id, provider.api);
  if (!base) return "No endpoint for xAI is configured on this console.";

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${CHANNEL_SYSTEM.replace("a messaging channel", `the "${channelName}" channel`)}`,
    },
    ...history.slice(-16).map((m) => ({
      role: (m.role === "in" ? "user" : "assistant") as "user" | "assistant",
      content: m.content.slice(0, 2000),
    })),
  ];

  try {
    const upstream = await fetch(`${base}${chatPath("openai")}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        openaiBody(model.id, messages, { stream: false, temperature: 0.7, maxTokens: 480 }),
      ),
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) return `Model call failed (${upstream.status}). Try again in a moment.`;
    const json = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    return text || "(Maestro stayed silent — odd. Try again.)";
  } catch {
    return "Could not reach the model just now. Try again in a moment.";
  }
}
