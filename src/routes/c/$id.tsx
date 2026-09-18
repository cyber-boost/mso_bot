import { createFileRoute } from "@tanstack/react-router";
import { Radio, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MaestroMark } from "@/components/mark";
import { fetchThread, sendToChannel, type ChannelMessage } from "@/lib/channels";
import { cn } from "@/lib/utils";

// Pocket Maestro — the phone-sized page a channel QR opens. The channel token
// travels in the ?key= query param; without it there is no thread to read.

export const Route = createFileRoute("/c/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    key: typeof search.key === "string" ? search.key : "",
  }),
  component: PocketChannel,
});

function PocketChannel() {
  const { id } = Route.useParams();
  const { key } = Route.useSearch();
  const [name, setName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Pocket Maestro";
  }, []);

  useEffect(() => {
    if (!key) {
      setError("This link is missing its channel key.");
      return;
    }
    let dead = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const t = await fetchThread(id, key);
        if (dead) return;
        setName(t.name);
        setMessages(t.messages);
        setError(null);
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : "Could not open this channel");
      }
      if (!dead) timer = setTimeout(poll, 6000);
    }
    void poll();
    return () => {
      dead = true;
      clearTimeout(timer);
    };
  }, [id, key]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setDraft("");
    setMessages((m) => [
      ...m,
      { id: -Date.now(), role: "in", content: text, created_at: new Date().toISOString() },
    ]);
    try {
      const reply = await sendToChannel(id, key, text);
      setMessages((m) => [
        ...m,
        { id: -Date.now() + 1, role: "out", content: reply, created_at: new Date().toISOString() },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: -Date.now() + 1,
          role: "out",
          content: e instanceof Error ? e.message : "Send failed — try again.",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
      box.current?.focus();
    }
  }

  return (
    <main className="flex h-dvh flex-col bg-bg text-fg">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <MaestroMark className="size-5" />
        <div className="flex min-w-0 flex-col">
          <span className="font-display text-lg italic leading-tight tracking-tight">
            Pocket Maestro
          </span>
          <span className="flex items-center gap-1 truncate text-micro text-subtle">
            <Radio className="size-2.5" />
            {name ?? id}
          </span>
        </div>
        <span className="ml-auto inline-flex size-2 rounded-full bg-ok pulse-dot" title="Live" />
      </header>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-4">
        {error ? (
          <p className="mx-auto my-auto max-w-xs text-center text-sm text-danger">{error}</p>
        ) : messages.length === 0 ? (
          <div className="mx-auto my-auto flex max-w-xs flex-col items-center gap-2 text-center">
            <Radio className="size-6 text-subtle" />
            <p className="text-sm text-muted">
              You're wired in. Say anything — Maestro answers from the console back home.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "in" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  m.role === "in"
                    ? "rounded-br-md bg-accent text-accent-fg"
                    : "rounded-bl-md bg-surface text-fg shadow-[0_0_0_1px_var(--color-border)]",
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {busy ? (
          <div className="flex justify-start">
            <div className="maestro-shimmer rounded-2xl rounded-bl-md bg-surface px-3.5 py-2 text-sm shadow-[0_0_0_1px_var(--color-border)]">
              conducting…
            </div>
          </div>
        ) : null}
      </div>

      <form
        className="flex shrink-0 gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={box}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message Maestro…"
          maxLength={2000}
          disabled={!key}
          className="h-11 flex-1 rounded-full bg-surface px-4 text-sm text-fg placeholder:text-subtle shadow-[0_0_0_1px_var(--color-border)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy || !key}
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg disabled:cursor-default disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </form>
    </main>
  );
}
