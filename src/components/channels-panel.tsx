import {
  Check,
  ChevronDown,
  Clipboard,
  Link2,
  Plus,
  Radio,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import {
  fetchChannels,
  fetchThread,
  sendToChannel,
  useChannels,
  type ChannelMessage,
  type ChannelSummary,
} from "@/lib/channels";
import { cn } from "@/lib/utils";

/** Channels — message Maestro from a phone, a Shortcut, or any webhook. */
export function ChannelsPanel() {
  const { tokens, hydrated, hydrate, saveToken, dropChannel } = useChannels();
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Poll the channel list for display. XP awarding for inbound messages lives
  // in channel-watch.ts, which runs no matter which view is on screen.
  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const list = await fetchChannels();
        if (dead) return;
        setChannels(list);
        setListError(null);
      } catch (e) {
        if (!dead) setListError(e instanceof Error ? e.message : "List failed");
      }
      if (!dead) timer = setTimeout(poll, 8000);
    }
    void poll();
    return () => {
      dead = true;
      clearTimeout(timer);
    };
  }, []);

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Pocket" }),
      });
      const j = (await res.json()) as { id?: string; token?: string; error?: string };
      if (!res.ok || !j.id || !j.token) throw new Error(j.error || `Create failed (${res.status})`);
      saveToken(j.id, j.token);
      setName("");
      setChannels(await fetchChannels());
      setOpenId(j.id);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await fetch("/api/channels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } finally {
      dropChannel(id);
      setChannels(await fetchChannels());
      if (openId === id) setOpenId(null);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 font-display text-2xl italic tracking-tight">
            <Radio className="size-5 text-muted" aria-hidden="true" />
            Channels
          </h2>
          <p className="max-w-lg text-sm leading-relaxed text-muted">
            Maestro, wherever you are. A channel is a private URL plus a token —
            scan the QR for the pocket chat on your phone, or POST from iOS
            Shortcuts, Tasker, or any webhook. Replies come from the platform
            model.
          </p>
        </header>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name it — pocket, errands, telegram…"
            maxLength={60}
            className="h-11 flex-1 rounded-lg bg-surface px-4 text-sm text-fg placeholder:text-subtle shadow-[0_0_0_1px_var(--color-border)] focus:outline-none"
          />
          <Button type="submit" disabled={busy}>
            <Plus className="size-4" />
            New channel
          </Button>
        </form>

        {listError ? <p className="text-xs text-danger">{listError}</p> : null}

        {hydrated && channels && channels.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg bg-surface p-5 shadow-[0_0_0_1px_var(--color-border)]">
            <h3 className="font-display text-xl italic tracking-tight">No wires out yet.</h3>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              Create one and you'll get a QR code for your phone plus a curl
              snippet for everything else. Messages land here and in the pocket
              page; Maestro answers with short, phone-sized replies.
            </p>
          </div>
        ) : null}

        <ul className="flex flex-col gap-3">
          {(channels ?? []).map((c) => (
            <ChannelCard
              key={c.id}
              channel={c}
              token={tokens[c.id]}
              open={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
              onDelete={() => void remove(c.id)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ChannelCard({
  channel,
  token,
  open,
  onToggle,
  onDelete,
}: {
  channel: ChannelSummary;
  token: string | undefined;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const pocketUrl = useMemo(() => {
    if (typeof window === "undefined" || !token) return "";
    return `${window.location.origin}/c/${channel.id}?key=${token}`;
  }, [channel.id, token]);
  const curl = useMemo(() => {
    if (typeof window === "undefined" || !token) return "";
    return `curl -X POST ${window.location.origin}/api/channels/${channel.id} -H 'content-type: application/json' -d '{"token":"${token}","text":"where are the beats at?"}'`;
  }, [channel.id, token]);

  return (
    <li className="overflow-hidden rounded-lg bg-surface shadow-[0_0_0_1px_var(--color-border)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="inline-flex size-2 shrink-0 rounded-full bg-ok pulse-dot" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm text-fg">{channel.name}</span>
            <span className="text-micro text-subtle">{channel.id}</span>
          </div>
          <div className="mt-0.5 text-micro text-subtle">
            {channel.message_count} message{channel.message_count === 1 ? "" : "s"}
            {channel.last_message_at ? ` · last ${channel.last_message_at.slice(0, 16).replace("T", " ")}` : " · quiet so far"}
          </div>
        </div>
        {token ? (
          <CopyButton text={pocketUrl} label="pocket link" icon={Link2} />
        ) : (
          <span className="text-micro text-danger" title="Tokens are shown once, on creation">
            token lost — recreate
          </span>
        )}
        <DeleteButton onDelete={onDelete} />
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-micro text-muted hover:text-fg"
          aria-expanded={open}
        >
          Open
          <ChevronDown className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")} />
        </button>
      </div>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
          {token ? (
            <div className="flex flex-col gap-4 sm:flex-row">
              <QrCard url={pocketUrl} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-micro uppercase tracking-wider text-subtle">Or post from anywhere</p>
                <div className="relative">
                  <pre className="terminal-scroll overflow-x-auto rounded-md bg-bg px-3 py-2 font-mono text-micro leading-relaxed text-fg">
                    {curl}
                  </pre>
                  <span className="absolute right-2 top-2">
                    <CopyButton text={curl} label="curl" icon={Clipboard} />
                  </span>
                </div>
                <p className="text-micro leading-relaxed text-subtle">
                  Works from iOS Shortcuts ("Get contents of URL", POST, JSON), Tasker,
                  Telegram bot webhooks, n8n — anything that can POST JSON. The reply
                  comes back as {"{\"reply\": \"…\"}"}.
                </p>
              </div>
            </div>
          ) : null}
          <ChannelThread id={channel.id} token={token} />
        </div>
      ) : null}
    </li>
  );
}

function QrCard({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 168 })
      .then((d) => live && setDataUrl(d))
      .catch(() => live && setDataUrl(null));
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <div className="flex shrink-0 flex-col items-center gap-2 self-start">
      <div className="rounded-md bg-white p-2">
        {dataUrl ? (
          <img src={dataUrl} alt="QR code for the pocket channel" width={168} height={168} />
        ) : (
          <div className="size-[168px] animate-pulse rounded-xs bg-bg/10" />
        )}
      </div>
      <p className="max-w-[180px] text-center text-micro leading-snug text-subtle">
        Scan with your phone — pocket Maestro
      </p>
    </div>
  );
}

function ChannelThread({ id, token }: { id: string; token: string | undefined }) {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    let dead = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const t = await fetchThread(id, token as string);
        if (dead) return;
        setMessages(t.messages);
        setError(null);
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : "Thread failed");
      }
      if (!dead) timer = setTimeout(poll, 6000);
    }
    void poll();
    return () => {
      dead = true;
      clearTimeout(timer);
    };
  }, [id, token]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const text = draft.trim();
    if (!text || !token || busy) return;
    setBusy(true);
    setDraft("");
    try {
      const reply = await sendToChannel(id, token, text);
      setMessages((m) => [
        ...m,
        { id: Date.now(), role: "in", content: text, created_at: new Date().toISOString() },
        { id: Date.now() + 1, role: "out", content: reply, created_at: new Date().toISOString() },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <p className="text-xs text-subtle">
        This console no longer holds the token for this channel, so its thread
        stays private. Create a new channel to take over.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-micro uppercase tracking-wider text-subtle">Thread</p>
      <div
        ref={scroller}
        className="terminal-scroll flex max-h-72 min-h-24 flex-col gap-2 overflow-y-auto rounded-md bg-bg p-3"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-subtle">Nothing yet — scan the QR and say hi.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "in" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-1.5 text-xs leading-relaxed",
                  m.role === "in" ? "bg-elevated text-fg" : "bg-surface text-fg shadow-[0_0_0_1px_var(--color-border)]",
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
      </div>
      {error ? <p className="text-micro text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          placeholder="Message as if from your phone…"
          maxLength={2000}
          className="h-10 flex-1 rounded-md bg-bg px-3 text-sm text-fg placeholder:text-subtle shadow-[0_0_0_1px_var(--color-border)] focus:outline-none"
        />
        <Button onClick={() => void send()} disabled={!draft.trim() || busy} size="sm" className="h-10">
          <Send className="size-3.5" />
          {busy ? "…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function CopyButton({ text, label, icon: Icon }: { text: string; label: string; icon: typeof Link2 }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md bg-elevated px-2 py-1 text-micro text-muted hover:text-fg"
    >
      {copied ? <Check className="size-3 text-ok" /> : <Icon className="size-3" />}
      {copied ? "copied" : label}
    </button>
  );
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2200);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => (armed ? onDelete() : setArmed(true))}
      className={cn(
        "rounded-md p-1.5 text-micro transition-colors duration-150",
        armed ? "bg-danger/15 text-danger" : "text-muted hover:text-fg",
      )}
      title={armed ? "Confirm delete" : "Delete channel"}
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
