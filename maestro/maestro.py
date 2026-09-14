#!/usr/bin/env python3
"""Maestro — conduct local and cloud models via OpenAI / Anthropic.

A single-file, stdlib-only CLI. Reads the models.dev catalog, routes each
provider to the matching protocol, and speaks to Ollama, LM Studio, vLLM,
and every BYOK cloud endpoint from one prompt.

    python3 maestro.py
    python3 maestro.py models grok
    python3 maestro.py chat grok-4.5
    python3 maestro.py run xai/grok-4.5 "hello"
    python3 maestro.py config set xai $XAI_API_KEY
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

VERSION = "1.1.0"
CATALOG_URL = "https://models.dev/api.json"
HOME = Path(os.environ.get("MAESTRO_HOME", Path.home() / ".maestro"))
CACHE = HOME / "catalog.json"
CONFIG = HOME / "config.json"
UA = f"Maestro/{VERSION}"

KNOWN_BASE = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "xai": "https://api.x.ai/v1",
    "groq": "https://api.groq.com/openai/v1",
    "google": "https://generativelanguage.googleapis.com/v1beta/openai",
    "mistral": "https://api.mistral.ai/v1",
    "cerebras": "https://api.cerebras.ai/v1",
    "togetherai": "https://api.together.xyz/v1",
    "deepinfra": "https://api.deepinfra.com/v1/openai",
    "perplexity": "https://api.perplexity.ai",
    "vercel": "https://ai-gateway.vercel.sh/v1",
    "v0": "https://ai-gateway.vercel.sh/v1",
    "cohere": "https://api.cohere.ai/compatibility/v1",
    "openrouter": "https://openrouter.ai/api/v1",
}

# Native labs float first when a search is ambiguous.
PREFERRED = (
    "xai",
    "anthropic",
    "openai",
    "google",
    "groq",
    "mistral",
    "cerebras",
    "togetherai",
    "ollama",
    "lmstudio",
    "vllm",
    "llamacpp",
)

SYNTHETIC = {
    "ollama": {
        "id": "ollama",
        "name": "Ollama",
        "npm": "@ai-sdk/openai-compatible",
        "api": "http://127.0.0.1:11434/v1",
        "env": ["OLLAMA_API_KEY"],
        "models": {},
    },
    "lmstudio": {
        "id": "lmstudio",
        "name": "LM Studio",
        "npm": "@ai-sdk/openai-compatible",
        "api": "http://127.0.0.1:1234/v1",
        "env": ["LMSTUDIO_API_KEY"],
        "models": {},
    },
    "vllm": {
        "id": "vllm",
        "name": "vLLM",
        "npm": "@ai-sdk/openai-compatible",
        "api": "http://127.0.0.1:8000/v1",
        "env": ["VLLM_API_KEY"],
        "models": {},
    },
    "llamacpp": {
        "id": "llamacpp",
        "name": "llama.cpp",
        "npm": "@ai-sdk/openai-compatible",
        "api": "http://127.0.0.1:8080/v1",
        "env": ["LLAMACPP_API_KEY"],
        "models": {},
    },
}

# ── io ──────────────────────────────────────────────────────────────────────


def _tty() -> bool:
    return sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


def dim(s: str) -> str:
    return f"\033[2m{s}\033[0m" if _tty() else s


def bold(s: str) -> str:
    return f"\033[1m{s}\033[0m" if _tty() else s


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def http_json(url: str, method: str = "GET", headers: dict | None = None, body: Any = None, timeout: int = 60):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", UA)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            return json.loads(raw.decode() or "null"), dict(res.headers), res.status
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(err)
        except json.JSONDecodeError:
            parsed = {"error": err[:400]}
        raise RuntimeError(_err_message(parsed, e.code)) from e
    except urllib.error.URLError as e:
        raise RuntimeError(str(e.reason or e)) from e


def http_stream(url: str, headers: dict, body: Any, on_line):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("User-Agent", UA)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "text/event-stream")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            buf = b""
            while True:
                chunk = res.read(256)
                if not chunk:
                    break
                buf += chunk
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    on_line(line.decode("utf-8", "replace").strip())
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(err)
        except json.JSONDecodeError:
            parsed = {"error": err[:400]}
        raise RuntimeError(_err_message(parsed, e.code)) from e


def _err_message(parsed: Any, code: int) -> str:
    if isinstance(parsed, dict):
        err = parsed.get("error")
        if isinstance(err, str) and err:
            return err
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
        if parsed.get("message"):
            return str(parsed["message"])
    return f"HTTP {code}"


# ── config / catalog ────────────────────────────────────────────────────────


def load_config() -> dict:
    if not CONFIG.exists():
        return {"model": "xai/grok-4.5", "keys": {}, "base": {}}
    try:
        return json.loads(CONFIG.read_text())
    except json.JSONDecodeError:
        die(f"corrupt config: {CONFIG}")
    return {}


def save_config(cfg: dict) -> None:
    HOME.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps(cfg, indent=2) + "\n")


def pull_catalog(force: bool = False) -> dict:
    HOME.mkdir(parents=True, exist_ok=True)
    if CACHE.exists() and not force:
        age = time.time() - CACHE.stat().st_mtime
        if age < 86400:
            data = json.loads(CACHE.read_text())
            _inject(data)
            return data
    body, _, _ = http_json(CATALOG_URL, timeout=30)
    if not isinstance(body, dict):
        die("models.dev returned unexpected payload")
    CACHE.write_text(json.dumps(body))
    _inject(body)
    return body


def _inject(data: dict) -> None:
    for k, v in SYNTHETIC.items():
        data.setdefault(k, v)


def protocol_of(provider: dict) -> str:
    npm = provider.get("npm") or ""
    return "anthropic" if "anthropic" in npm else "openai"


def base_url(pid: str, provider: dict, cfg: dict) -> str | None:
    override = (cfg.get("base") or {}).get(pid)
    if override:
        return override.rstrip("/")
    api = provider.get("api")
    if api:
        return str(api).rstrip("/")
    return KNOWN_BASE.get(pid)


def is_chat(model: dict | None) -> bool:
    if not model:
        return True
    mods = (model.get("modalities") or {}).get("output") or ["text"]
    return "text" in mods


def _pref_rank(pid: str) -> int:
    try:
        return PREFERRED.index(pid)
    except ValueError:
        return 100 + (ord(pid[:1]) if pid else 0)


def iter_models(catalog: dict):
    for pid, p in catalog.items():
        for mid, m in (p.get("models") or {}).items():
            rid = m.get("id") or mid
            yield pid, p, rid, m


def search_models(catalog: dict, query: str, provider: str | None = None, chat_only: bool = True) -> list[dict]:
    q = (query or "").lower().strip()
    hits: list[dict] = []
    for pid, p, mid, m in iter_models(catalog):
        if provider and pid != provider:
            continue
        if chat_only and not is_chat(m):
            continue
        name = m.get("name") or mid
        hay = f"{pid} {p.get('name')} {mid} {name} {m.get('family') or ''}".lower()
        if q and q not in hay:
            continue
        lim = m.get("limit") or {}
        cost = m.get("cost") or {}
        hits.append(
            {
                "ref": f"{pid}/{mid}",
                "provider": pid,
                "id": mid,
                "name": name,
                "protocol": protocol_of(p),
                "context": lim.get("context"),
                "input": cost.get("input"),
                "output": cost.get("output"),
                "reasoning": bool(m.get("reasoning")),
                "tools": bool(m.get("tool_call")),
                "_score": _hit_score(pid, mid, name, q),
            }
        )
    hits.sort(key=lambda h: (h["_score"], h["ref"]))
    for h in hits:
        h.pop("_score", None)
    return hits


def _hit_score(pid: str, mid: str, name: str, q: str) -> tuple:
    """Lower is better. Native labs + exact ids beat resellers."""
    mid_l = mid.lower()
    name_l = name.lower()
    if not q:
        return (_pref_rank(pid), mid_l)
    exact_id = mid_l == q
    exact_name = name_l == q
    starts_id = mid_l.startswith(q)
    starts_name = name_l.startswith(q)
    pid_hit = pid == q
    return (
        0 if exact_id else 1,
        0 if exact_name else 1,
        0 if starts_id else 1,
        0 if starts_name else 1,
        0 if pid_hit else 1,
        _pref_rank(pid),
        mid_l,
    )


def split_ref(ref: str) -> tuple[str, str]:
    if "/" not in ref:
        die("model id must be provider/model  (e.g. xai/grok-4.5)")
    pid, mid = ref.split("/", 1)
    return pid, mid


def resolve(catalog: dict, ref: str) -> tuple[str, dict, str, dict | None]:
    """Accept provider/model, a bare model id, or a unique search token."""
    ref = (ref or "").strip()
    if not ref:
        die("missing model")
    if "/" in ref:
        pid, mid = split_ref(ref)
        provider = catalog.get(pid)
        if not provider:
            die(f"unknown provider: {pid}")
        models = provider.get("models") or {}
        model = models.get(mid)
        if model is None:
            for k, m in models.items():
                if (m.get("id") or k) == mid:
                    model = m
                    mid = m.get("id") or k
                    break
        if model is None and pid not in SYNTHETIC:
            die(f"unknown model: {pid}/{mid}")
        return pid, provider, mid, model

    q = ref.lower()
    exact: list[tuple[str, dict, str, dict]] = []
    fuzzy: list[tuple[str, dict, str, dict]] = []
    for pid, p, mid, m in iter_models(catalog):
        if not is_chat(m):
            continue
        name = (m.get("name") or mid).lower()
        if mid.lower() == q or name == q:
            exact.append((pid, p, mid, m))
        elif q in mid.lower() or q in name:
            fuzzy.append((pid, p, mid, m))
    pool = exact or fuzzy
    if not pool:
        die(f"unknown model: {ref}  (try: maestro models {ref})")
    pool.sort(key=lambda t: (_pref_rank(t[0]), t[2].lower()))
    if len(pool) > 1 and not exact:
        shown = ", ".join(f"{a}/{c}" for a, _b, c, _m in pool[:8])
        die(f"ambiguous: {ref}\n  {shown}\n  use provider/model")
    pid, provider, mid, model = pool[0]
    return pid, provider, mid, model


def key_for(pid: str, provider: dict, cfg: dict) -> str | None:
    env_names = provider.get("env") or [f"{pid.upper()}_API_KEY"]
    for name in env_names:
        val = os.environ.get(name)
        if val:
            return val
    stored = (cfg.get("keys") or {}).get(pid)
    if stored:
        return stored
    return os.environ.get("MAESTRO_API_KEY")


# ── protocols ───────────────────────────────────────────────────────────────


def chat_request(protocol: str, model: str, messages: list[dict], stream: bool, max_tokens: int, temperature: float | None):
    if protocol == "anthropic":
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        rest = [
            {"role": "assistant" if m["role"] == "assistant" else "user", "content": m["content"]}
            for m in messages
            if m["role"] != "system"
        ]
        body: dict[str, Any] = {"model": model, "messages": rest, "max_tokens": max_tokens, "stream": stream}
        if system:
            body["system"] = system
        if temperature is not None:
            body["temperature"] = temperature
        path = "/messages"
    else:
        body = {"model": model, "messages": messages, "max_tokens": max_tokens, "stream": stream}
        if temperature is not None:
            body["temperature"] = temperature
        path = "/chat/completions"
    return path, body


def auth_headers(protocol: str, key: str) -> dict:
    if protocol == "anthropic":
        return {"x-api-key": key, "anthropic-version": "2023-06-01"}
    return {"Authorization": f"Bearer {key}"}


def _delta(protocol: str, payload: dict) -> str:
    if protocol == "anthropic":
        d = payload.get("delta") or {}
        return d.get("text") or ""
    choices = payload.get("choices") or []
    if not choices:
        return ""
    return ((choices[0].get("delta") or {}).get("content")) or ""


def complete(
    base: str,
    protocol: str,
    key: str,
    model: str,
    messages: list[dict],
    stream: bool,
    max_tokens: int,
    temperature: float | None,
) -> str:
    path, body = chat_request(protocol, model, messages, stream, max_tokens, temperature)
    url = f"{base}{path}"
    headers = auth_headers(protocol, key)
    if not stream:
        data, _, _ = http_json(url, "POST", headers, body)
        if protocol == "anthropic":
            blocks = data.get("content") or []
            return "".join(b.get("text") or "" for b in blocks if isinstance(b, dict))
        choices = data.get("choices") or []
        return ((choices[0].get("message") or {}).get("content")) or ""

    out: list[str] = []

    def on_line(line: str) -> None:
        if not line.startswith("data:"):
            return
        data = line[5:].strip()
        if not data or data == "[DONE]":
            return
        try:
            payload = json.loads(data)
        except json.JSONDecodeError:
            return
        piece = _delta(protocol, payload)
        if piece:
            out.append(piece)
            sys.stdout.write(piece)
            sys.stdout.flush()

    http_stream(url, headers, body, on_line)
    if out:
        sys.stdout.write("\n")
        sys.stdout.flush()
    return "".join(out)


# ── commands ────────────────────────────────────────────────────────────────


def cmd_pull(_args: argparse.Namespace) -> None:
    pull_catalog(force=True)
    print(f"catalog cached → {CACHE}")


def cmd_providers(args: argparse.Namespace) -> None:
    cat = pull_catalog()
    rows = []
    for pid, p in cat.items():
        proto = protocol_of(p)
        n = len(p.get("models") or {})
        api = p.get("api") or KNOWN_BASE.get(pid) or ""
        rows.append((p.get("name") or pid, pid, proto, n, api))
    rows.sort(key=lambda r: (_pref_rank(r[1]), r[0].lower()))
    q = (args.query or "").lower()
    if q:
        rows = [r for r in rows if q in r[0].lower() or q in r[1].lower()]
    if args.json:
        print(json.dumps([{"name": a, "id": b, "protocol": c, "models": d, "api": e} for a, b, c, d, e in rows], indent=2))
        return
    print(f"{bold('PROVIDER'):28} {'ID':20} {'PROTO':10} {'N':>5}  API")
    for name, pid, proto, n, api in rows:
        print(f"{name[:28]:28} {pid[:20]:20} {proto:10} {n:5}  {dim(api)}")
    print(dim(f"{len(rows)} providers  ·  models.dev"))


def cmd_models(args: argparse.Namespace) -> None:
    cat = pull_catalog()
    hits = search_models(cat, args.query or "", provider=args.provider, chat_only=not args.all)
    if args.json:
        print(json.dumps(hits, indent=2))
        return
    print(f"{bold('REF'):42} {'NAME':28} {'CTX':>7} {'$/M in':>8}  FLAGS")
    for h in hits[: args.limit]:
        flags = []
        if h["reasoning"]:
            flags.append("reason")
        if h["tools"]:
            flags.append("tools")
        ctx = f"{h['context'] // 1000}k" if h["context"] else "—"
        cin = f"{h['input']}" if h["input"] is not None else "—"
        print(f"{h['ref'][:42]:42} {h['name'][:28]:28} {ctx:>7} {cin:>8}  {dim(' '.join(flags))}")
    print(dim(f"{min(len(hits), args.limit)} / {len(hits)}  ·  maestro models --provider xai"))


def cmd_which(args: argparse.Namespace) -> None:
    cfg = load_config()
    cat = pull_catalog()
    ref = args.model or cfg.get("model") or "xai/grok-4.5"
    pid, provider, mid, model = resolve(cat, ref)
    proto = protocol_of(provider)
    base = base_url(pid, provider, cfg)
    has_key = bool(key_for(pid, provider, cfg))
    info = {
        "ref": f"{pid}/{mid}",
        "name": (model or {}).get("name") or mid,
        "protocol": proto,
        "base": base,
        "key": "set" if has_key else "missing",
        "env": provider.get("env") or [],
        "local": _local(base or ""),
    }
    if args.json:
        print(json.dumps(info, indent=2))
        return
    print(f"{bold(info['ref'])}  {info['name']}")
    print(f"  protocol  {proto}")
    print(f"  endpoint  {base or '—'}")
    print(f"  key       {info['key']}  {dim(' '.join(info['env']))}")


def cmd_use(args: argparse.Namespace) -> None:
    cat = pull_catalog()
    pid, provider, mid, _model = resolve(cat, args.model)
    cfg = load_config()
    cfg["model"] = f"{pid}/{mid}"
    save_config(cfg)
    print(f"default → {pid}/{mid}  ({protocol_of(provider)})")


def cmd_config(args: argparse.Namespace) -> None:
    cfg = load_config()
    if args.action == "set":
        if not args.provider or not args.value:
            die("usage: maestro config set <provider> <api-key>")
        cfg.setdefault("keys", {})[args.provider] = args.value
        save_config(cfg)
        print(f"key stored for {args.provider}  ({CONFIG})")
        return
    if args.action == "base":
        if not args.provider or not args.value:
            die("usage: maestro config base <provider> <url>")
        cfg.setdefault("base", {})[args.provider] = args.value
        save_config(cfg)
        print(f"base url for {args.provider} → {args.value}")
        return
    if args.action == "unset":
        if not args.provider:
            die("usage: maestro config unset <provider>")
        (cfg.get("keys") or {}).pop(args.provider, None)
        save_config(cfg)
        print(f"key removed for {args.provider}")
        return
    redacted = json.loads(json.dumps(cfg))
    for k in redacted.get("keys") or {}:
        v = redacted["keys"][k]
        redacted["keys"][k] = (v[:3] + "…" + v[-3:]) if isinstance(v, str) and len(v) > 8 else "(set)"
    print(json.dumps(redacted, indent=2))
    print(dim(str(CONFIG)))


def _run_once(
    ref: str,
    prompt: str,
    stream: bool,
    max_tokens: int,
    temperature: float | None,
    extra: list[dict] | None = None,
) -> str:
    cfg = load_config()
    cat = pull_catalog()
    pid, provider, mid, _model = resolve(cat, ref)
    proto = protocol_of(provider)
    base = base_url(pid, provider, cfg)
    if not base:
        die(f"no endpoint for {pid}. maestro config base {pid} https://…")
    key = key_for(pid, provider, cfg)
    if not key and not _local(base):
        env = (provider.get("env") or ["API_KEY"])[0]
        die(f"no key for {pid}. export {env}=…  or  maestro config set {pid} <key>")
    key = key or "local"
    messages = list(extra or [])
    messages.append({"role": "user", "content": prompt})
    return complete(base, proto, key, mid, messages, stream, max_tokens, temperature)


def _local(url: str) -> bool:
    return any(h in url for h in ("127.0.0.1", "localhost", "0.0.0.0", "::1"))


def cmd_run(args: argparse.Namespace) -> None:
    text = _run_once(
        args.model,
        args.prompt,
        stream=not args.no_stream,
        max_tokens=args.max_tokens,
        temperature=args.temperature,
    )
    if args.no_stream:
        print(text)


def cmd_chat(args: argparse.Namespace) -> None:
    cfg = load_config()
    ref = args.model or cfg.get("model") or "xai/grok-4.5"
    cat = pull_catalog()
    pid, provider, mid, model = resolve(cat, ref)
    proto = protocol_of(provider)
    print(dim(f"maestro {pid}/{mid}  ·  {proto}  ·  /exit  /clear  /use"))
    if model:
        print(dim(model.get("name") or mid))
    history: list[dict] = []
    if args.system:
        history.append({"role": "system", "content": args.system})
    try:
        import readline  # noqa: F401  — history on unix
    except ImportError:
        pass
    while True:
        try:
            line = input(bold("you> ")).strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            continue
        if line in {"/exit", "/quit"}:
            break
        if line == "/clear":
            history = [m for m in history if m["role"] == "system"]
            continue
        if line.startswith("/use "):
            ref = line.split(None, 1)[1]
            pid, provider, mid, model = resolve(cat, ref)
            proto = protocol_of(provider)
            print(dim(f"now {pid}/{mid}  ·  {proto}"))
            continue
        sys.stdout.write(bold("maestro> "))
        sys.stdout.flush()
        text = _run_once(
            f"{pid}/{mid}",
            line,
            stream=True,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            extra=history,
        )
        history.append({"role": "user", "content": line})
        history.append({"role": "assistant", "content": text})


def cmd_version(_args: argparse.Namespace) -> None:
    print(f"maestro {VERSION}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="maestro",
        description="Conduct local and cloud models via the OpenAI and Anthropic protocols.",
    )
    p.add_argument("--version", action="store_true")
    sub = p.add_subparsers(dest="cmd")

    sp = sub.add_parser("pull", help="refresh the models.dev catalog")
    sp.set_defaults(func=cmd_pull)

    sp = sub.add_parser("providers", help="list BYOK providers")
    sp.add_argument("query", nargs="?")
    sp.add_argument("--json", action="store_true")
    sp.set_defaults(func=cmd_providers)

    sp = sub.add_parser("models", help="search the catalog")
    sp.add_argument("query", nargs="?")
    sp.add_argument("--provider")
    sp.add_argument("--json", action="store_true")
    sp.add_argument("--all", action="store_true", help="include image/audio/video models")
    sp.add_argument("--limit", type=int, default=40)
    sp.set_defaults(func=cmd_models)

    sp = sub.add_parser("which", help="show the resolved model + protocol")
    sp.add_argument("model", nargs="?")
    sp.add_argument("--json", action="store_true")
    sp.set_defaults(func=cmd_which)

    sp = sub.add_parser("use", help="set the default model")
    sp.add_argument("model")
    sp.set_defaults(func=cmd_use)

    sp = sub.add_parser("config", help="keys and base URLs")
    sp.add_argument("action", nargs="?", default="show", choices=["show", "set", "unset", "base"])
    sp.add_argument("provider", nargs="?")
    sp.add_argument("value", nargs="?")
    sp.set_defaults(func=cmd_config)

    sp = sub.add_parser("run", help="one-shot prompt")
    sp.add_argument("model")
    sp.add_argument("prompt")
    sp.add_argument("--no-stream", action="store_true")
    sp.add_argument("--max-tokens", type=int, default=1024)
    sp.add_argument("--temperature", type=float, default=None)
    sp.set_defaults(func=cmd_run)

    sp = sub.add_parser("chat", help="interactive chat")
    sp.add_argument("model", nargs="?")
    sp.add_argument("--system")
    sp.add_argument("--max-tokens", type=int, default=2048)
    sp.add_argument("--temperature", type=float, default=None)
    sp.set_defaults(func=cmd_chat)

    sp = sub.add_parser("version", help="print version")
    sp.set_defaults(func=cmd_version)

    return p


def main(argv: list[str] | None = None) -> None:
    argv = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    try:
        if not argv:
            args = parser.parse_args(["chat"])
            args.func(args)
            return
        args = parser.parse_args(argv)
        if getattr(args, "version", False):
            cmd_version(args)
            return
        if args.cmd is None:
            parser.print_help()
            return
        args.func(args)
    except BrokenPipeError:
        try:
            sys.stdout.close()
        except Exception:
            pass
        raise SystemExit(0)


if __name__ == "__main__":
    main()
