-- Channels — message Maestro from anywhere (QR pocket page, curl, Shortcuts,
-- bot webhooks). No user accounts: a channel is owned by whoever holds its
-- unguessable token. Inbound messages and Maestro's replies are stored here so
-- the console and the pocket page can both read the thread.

create table if not exists channel (
  id text primary key,
  name text not null,
  token text not null,
  created_at timestamptz not null default now()
);

create table if not exists channel_message (
  id bigserial primary key,
  channel_id text not null references channel(id) on delete cascade,
  role text not null check (role in ('in', 'out')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists channel_message_channel_id_id
  on channel_message(channel_id, id);
