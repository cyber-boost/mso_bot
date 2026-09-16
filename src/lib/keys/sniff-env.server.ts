/**
 * Maestro "Sniffer" — find provider API keys right away.
 *
 * Port of the original Python key-sniffing logic (`sniff_env_var_candidates` /
 * `shell_config_paths` / `_extract_assignment` / `_extract_powershell_env`) to a
 * server-only Node module. It inspects the running process environment plus the
 * likely shell config files for the current OS (PowerShell profiles, bash/zsh/
 * fish), so a human does not have to hunt for a key and the models can use one
 * that already exists on the machine.
 *
 * Safety: the list endpoint returns only masked values + source + confidence.
 * Raw values are handed out one provider at a time by an explicit activation
 * call, and are never logged.
 *
 * NOTE: server-only — imports Node fs/os/path, so it must never be imported
 * from client code.
 */
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProviderInfo, ProviderSniff } from "@/lib/types";

const WIN = process.platform === "win32";

/** OS-appropriate shell/profile files to scan for `KEY=value` assignments. */
export function shellConfigPaths(): string[] {
  const home = os.homedir();
  const paths = new Set<string>();

  if (WIN) {
    // PowerShell profiles, both plain and OneDrive-redirected Documents.
    for (const base of [path.join(home, "Documents"), path.join(home, "OneDrive", "Documents")]) {
      paths.add(path.join(base, "PowerShell", "Microsoft.PowerShell_profile.ps1"));
      paths.add(path.join(base, "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"));
    }
    // Git Bash / MSYS on Windows.
    for (const f of [".bashrc", ".bash_profile", ".profile"]) paths.add(path.join(home, f));
  } else {
    for (const f of [".bashrc", ".bash_profile", ".profile", ".zshrc", ".zshenv", ".zprofile"]) {
      paths.add(path.join(home, f));
    }
    paths.add(path.join(home, ".config", "fish", "config.fish"));
  }
  // A local `.env` on the host is a reasonable extra stop regardless of OS.
  paths.add(path.join(home, ".env"));

  return [...paths].filter((p) => existsSync(p));
}

type Parsed = { key: string; value: string; confidence: number; source: string };

/** Resolve a simple `$KEY` / `${KEY}` reference against the environment. */
function resolveReference(raw: string, env: Record<string, string | undefined>): string {
  const value = raw.trim();
  const m = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(value);
  if (m) return env[m[1]] ?? value;
  return value;
}

/** Strip a trailing ` # comment` (assumes a value with a space before #). */
function stripComment(raw: string, env: Record<string, string | undefined>): string {
  const cleaned = raw.replace(/^["']|["']$/g, "");
  const idx = cleaned.indexOf(" #");
  return resolveReference(idx === -1 ? cleaned : cleaned.slice(0, idx).trim(), env);
}

/** POSIX-style assignment: `export KEY=value`, `declare -x`, `KEY=value`, fish. */
function extractAssignment(line: string, env: Record<string, string | undefined>): Parsed | null {
  let m = /^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/.exec(line);
  if (m) {
    return { key: m[1], value: stripComment(m[2].trim(), env), confidence: 92, source: "shell:export" };
  }
  m = /^\s*declare\s+-x\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/.exec(line);
  if (m) {
    return { key: m[1], value: stripComment(m[2].trim(), env), confidence: 88, source: "shell:declare" };
  }
  m = /^\s*set\s+(-x\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+(.+?)\s*$/.exec(line);
  if (m) {
    const value = stripComment(m[3].trim(), env);
    return { key: m[2], value, confidence: m[1] ? 90 : 84, source: "shell:fish" };
  }
  m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/.exec(line.trim());
  if (m) {
    return { key: m[1], value: stripComment(m[2].trim(), env), confidence: 86, source: "shell:assign" };
  }
  return null;
}

/** PowerShell assignment: `$env:KEY = "value"` and `[Environment]::Set...`. */
function extractPowerShellEnv(line: string, env: Record<string, string | undefined>): Parsed | null {
  let m = /^\s*\$env:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/.exec(line);
  if (m) {
    return {
      key: m[1],
      value: stripComment(m[2].trim(), env),
      confidence: 90,
      source: "powershell:env",
    };
  }
  m =
    /^\s*\[Environment\]::SetEnvironmentVariable\s*\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*,\s*["']([^"']+)["']/.exec(
      line,
    );
  if (m) return { key: m[1], value: m[2], confidence: 88, source: "powershell:dotnet" };
  return null;
}

/**
 * Sniff env keys from the process environment (100% confidence) then from
 * shell/profile files. Keeps the highest-confidence first hit per key.
 */
export function sniffEnvVarCandidates(
  wanted: string[],
): Record<string, { value: string; confidence: number; source: string }> {
  const wantedSet = [...new Set(wanted.filter(Boolean))];
  if (!wantedSet.length) return {};
  const env: Record<string, string | undefined> = process.env;
  const found: Record<string, { value: string; confidence: number; source: string }> = {};

  for (const key of wantedSet) {
    const v = env[key];
    if (v) found[key] = { value: v, confidence: 100, source: "process_env" };
  }

  for (const file of shellConfigPaths()) {
    let lines: string[];
    try {
      lines = readFileSync(file, "utf8").split(/\r?\n/);
    } catch {
      continue;
    }
    for (const line of lines) {
      const parsed = file.endsWith(".ps1")
        ? extractPowerShellEnv(line, env)
        : extractAssignment(line, env);
      if (!parsed || !parsed.value) continue;
      // Keep the first (most trustworthy) source for each key.
      if (!(parsed.key in found)) {
        found[parsed.key] = {
          value: parsed.value,
          confidence: parsed.confidence,
          source: `${parsed.source}:${path.basename(file)}`,
        };
      }
    }
  }
  return found;
}

/** Mask a key for display: e.g. `sk-1234…wxyz`. */
export function maskValue(value: string, reveal = 4): string {
  if (!value) return "";
  if (value.length <= reveal * 2) return `${value.slice(0, 2)}…`;
  return `${value.slice(0, reveal)}…${value.slice(-reveal)}`;
}

/** Sniff which of the given provider env keys are present on the machine. */
export function sniffProviders(providers: ProviderInfo[]): ProviderSniff[] {
  const wanted = providers.flatMap((p) => p.env);
  const found = sniffEnvVarCandidates(wanted);
  return providers.map((p) => {
    let hit: { value: string; confidence: number; source: string } | null = null;
    let hitKey = "";
    for (const key of p.env) {
      if (key in found) {
        hit = found[key];
        hitKey = key;
        break;
      }
    }
    return {
      id: p.id,
      name: p.name,
      protocol: p.protocol,
      api: p.api,
      env: [...p.env],
      found: hit ? hitKey : null,
      result: hit
        ? {
            key: hitKey,
            found: true,
            masked: maskValue(hit.value),
            confidence: hit.confidence,
            source: hit.source,
            value: null, // never shipped in the aggregate
          }
        : null,
    };
  });
}

/** Return the raw detected value for one provider (used on activation). */
export function valueForProvider(
  providers: ProviderInfo[],
  providerId: string,
): { key: string; value: string } | null {
  const p = providers.find((x) => x.id === providerId);
  const wanted = p?.env ?? [];
  if (!wanted.length) return null;
  const found = sniffEnvVarCandidates(wanted);
  for (const key of p!.env) {
    if (key in found) return { key, value: found[key].value };
  }
  return null;
}
