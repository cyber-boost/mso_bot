import { createFileRoute } from "@tanstack/react-router";
import {
  addMessage,
  channelByToken,
  channelReply,
  recentMessages,
} from "@/lib/channels.server";

// The on-the-go side of a channel: POST a message in, get Maestro's reply
// back; GET the thread. Both gated by the channel token.

export const Route = createFileRoute("/api/channels/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.id ?? "";
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        let channel;
        try {
          channel = await channelByToken(id, token);
        } catch (e) {
          return Response.json({ error: errMsg(e) }, { status: 500 });
        }
        if (!channel) return Response.json({ error: "Unknown channel" }, { status: 404 });
        const messages = await recentMessages(id, 60);
        return Response.json({ channel, messages });
      },

      POST: async ({ request, params }) => {
        const id = params.id ?? "";
        let body: { token?: string; text?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const token = (body.token ?? "").trim();
        const text = (body.text ?? "").trim().slice(0, 2000);
        if (!text) return Response.json({ error: "text is required" }, { status: 400 });

        let channel;
        try {
          channel = await channelByToken(id, token);
        } catch (e) {
          return Response.json({ error: errMsg(e) }, { status: 500 });
        }
        if (!channel) return Response.json({ error: "Unknown channel" }, { status: 404 });

        try {
          await addMessage(id, "in", text);
          const history = await recentMessages(id, 40);
          const reply = await channelReply(channel.name, history);
          await addMessage(id, "out", reply);
          return Response.json({ reply });
        } catch (e) {
          return Response.json({ error: errMsg(e) }, { status: 500 });
        }
      },
    },
  },
});

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Channel failed";
}
