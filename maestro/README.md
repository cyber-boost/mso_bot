# Maestro

A single-file Python CLI that conducts local and cloud models over the
**OpenAI Chat Completions** and **Anthropic Messages** protocols.

It downloads the BYOK catalog from [models.dev](https://models.dev)
(`https://models.dev/api.json`) and routes each provider automatically.

```bash
python3 maestro.py
python3 maestro.py models grok
python3 maestro.py chat grok-4.5
python3 maestro.py run xai/grok-4.5 "hello"
python3 maestro.py config set xai "$XAI_API_KEY"
python3 maestro.py run ollama/llama3.2 "hi"
```

No third-party packages. Python 3.10+.

Config lives in `~/.maestro/`. Catalog cache refreshes daily (`maestro pull`).

Bare model ids resolve to the native lab first (`grok-4.5` → `xai/grok-4.5`).
