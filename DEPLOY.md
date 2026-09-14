# Deploying Maestro to your own VPS

Maestro is a self-contained server-rendered app (TanStack Start on a Nitro
**node-server** build). No external database is required — the app uses an
embedded PGLite fallback with no migrations, and chat keys come from each user's
browser, or from a server-side `XAI_API_KEY`. It runs as a single Node process
behind Docker. No Vercel involved.

## What you need on the server

- A Linux VPS (Ubuntu/Debian recommended) with **Docker + Compose** installed.
- A way to get the code onto it (`git clone` or `scp`).
- (Optional) An xAI API key if you want chat to work without per-user keys.

---

## Option A — Docker (recommended)

This repo ships a `Dockerfile` and `docker-compose.yml`. The image builds the
app inside, then runs the tiny Nitro Node server on port `8080`.

```bash
# 1. Get the code onto the server
git clone <your-repo-url> maestro && cd maestro
#   (or: scp -r <this-folder> user@server:/opt/maestro && cd /opt/maestro)

# 2. (Optional) enable the xAI key
#    edit docker-compose.yml and uncomment the XAI_API_KEY line

# 3. Build + start
docker compose up -d --build

# 4. Check it's up
docker compose ps
curl -I http://127.0.0.1:8080/
```

The app now listens on your server's port `8080`. Open `http://YOUR_SERVER_IP:8080`.

To update after a new change:

```bash
git pull && docker compose up -d --build
```

To stop/remove:

```bash
docker compose down
```

---

## Option B — bare Node (no Docker)

If you prefer no Docker, the built output runs directly under Node 20+:

```bash
# On the server:
npm ci
npm run build          # emits .output/server/index.mjs
PORT=8080 HOST=0.0.0.0 node .output/server/index.mjs
```

Run it under a process manager so it survives reboots (systemd example):

```ini
# /etc/systemd/system/maestro.service
[Unit]
Description=Maestro
After=network.target

[Service]
WorkingDirectory=/opt/maestro
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/node /opt/maestro/.output/server/index.mjs
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now maestro
```

---

## TLS / domain (strongly recommended)

For real usage you want HTTPS. The app is an ordinary web server, so the simplest
path is a reverse proxy like **Caddy** (free, auto-issues Let's Encrypt certs):

```bash
# /etc/caddy/Caddyfile
yourdomain.com {
    reverse_proxy 127.0.0.1:8080
}
```

Point a DNS record at your server, then:

```bash
sudo apt install caddy       # or docker run caddy
sudo systemctl restart caddy
```

Caddy issues the cert automatically and proxies traffic (including the SSE
chat stream) to port 8080.

---

## Environment variables

| Var           | Purpose                                             | Required |
|---------------|-----------------------------------------------------|----------|
| `PORT`        | Listening port (Docker already exports 8080)        | no (8080)|
| `HOST`        | Bind address (default `0.0.0.0`)                    | no       |
| `XAI_API_KEY` | Server-side xAI key for the chat console            | optional |

`DATABASE_URL` is optional; if unset the app runs on its embedded PGLite
fallback. Nothing is configured to persist server-side data today, so there is
no volume or DB migration to run.
