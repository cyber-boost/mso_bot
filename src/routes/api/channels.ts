import { createFileRoute } from "@tanstack/react-router";
import {
  createChannel,
  deleteChannel,
  listChannels,
  newChannelId,
  newChannelToken,
} from "@/lib/channels.server";

export const Route = createFileRoute("/api/channels")({
  server: {
    handlers: {
      // Console: list channels (tokens are never listed — they're returned
      // only on creation).
      GET: async () => {
        try {
          const channels = await listChannels();
          return Response.json({ channels });
        } catch (e) {
          return Response.json({ error: errMsg(e) }, { status: 500 });
        }
      },

      // Console: create a channel. The token is returned this once.
      POST: async ({ request }) => {
        let body: { name?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const name = (body.name ?? "").trim().slice(0, 60) || "Pocket";
        const id = newChannelId();
        const token = newChannelToken();
        try {
          await createChannel(id, name, token);
        } catch (e) {
          return Response.json({ error: errMsg(e) }, { status: 500 });
        }
        return Response.json({ id, name, token });
      },

      // Console: delete a channel and its thread.
      DELETE: async ({ request }) => {
        let body: { id?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const id = (body.id ?? "").trim();
        if (!id) return Response.json({ error: "id is required" }, { status: 400 });
        try {
          await deleteChannel(id);
        } catch (e) {
          return Response.json({ error: errMsg(e) }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Channel storage failed";
}
