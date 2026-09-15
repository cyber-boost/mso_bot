#!/usr/bin/env node
/**
 * Fetch a standalone Node runtime and place it as the Maestro Tauri sidecar.
 *
 * Tauri `bundle.externalBin` ships a binary named
 * `maestro-backend-<target-triple>(.exe)` from `src-tauri/binaries/`. At runtime
 * it is renamed to `maestro-backend` and executed AS the Node process that runs
 * the bundled `.output/server/index.mjs` (see src-tauri/src/lib.rs), serving the
 * app + /api/chat on localhost. So this sidecar file must be a real Node binary.
 *
 * The target triple is taken from `--target <triple>`, or inferred from the
 * host OS/arch when absent. Node version/dist overridable via env:
 *   NODE_VERSION  (default 24.21.0)
 *   NODE_DIST_URL (default https://nodejs.org/dist)
 *
 * Usage:
 *   node scripts/fetch-sidecar.mjs --target x86_64-pc-windows-msvc
 *   node scripts/fetch-sidecar.mjs                    # host arch/OS
 */
import { createRequire } from "node:module";
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { get as httpsGet } from "node:https";
import { execFileSync } from "node:child_process";
import os from "node:os";

const require = createRequire(import.meta.url);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src-tauri", "binaries");
const NODE_VERSION = process.env.NODE_VERSION || "24.21.0";
const DIST = process.env.NODE_DIST_URL || "https://nodejs.org/dist";

function resolveTarget(target) {
  const t = (pkg, kind) => ({ pkg, kind });
  switch (target) {
    case "x86_64-pc-windows-msvc": return t(`node-v${NODE_VERSION}-win-x64.zip`, "zip");
    case "aarch64-pc-windows-msvc": return t(`node-v${NODE_VERSION}-win-arm64.zip`, "zip");
    case "x86_64-apple-darwin": return t(`node-v${NODE_VERSION}-darwin-x64.tar.gz`, "tar");
    case "aarch64-apple-darwin": return t(`node-v${NODE_VERSION}-darwin-arm64.tar.gz`, "tar");
    case "x86_64-unknown-linux-gnu": return t(`node-v${NODE_VERSION}-linux-x64.tar.gz`, "tar");
    case "aarch64-unknown-linux-gnu": return t(`node-v${NODE_VERSION}-linux-arm64.tar.gz`, "tar");
    // NB: musl tarballs use `linux-x64-musl` (NOT `linuxmusl-x64`) and are only
    // published for Node >= 24. (The Tauri musl target is dropped — see
    // desktop.yml — because webkit2gtk/GTK are glibc-only.)
    case "x86_64-unknown-linux-musl": return t(`node-v${NODE_VERSION}-linux-x64-musl.tar.gz`, "tar");
    default: return null;
  }
}

function hostTarget() {
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const isLinux = process.platform === "linux";
  const arm = os.arch() === "arm64";
  const x64 = os.arch() === "x64";
  if (isWin) return x64 ? "x86_64-pc-windows-msvc" : arm ? "aarch64-pc-windows-msvc" : null;
  if (isMac) return arm ? "aarch64-apple-darwin" : x64 ? "x86_64-apple-darwin" : null;
  if (isLinux) return arm ? "aarch64-unknown-linux-gnu" : x64 ? "x86_64-unknown-linux-gnu" : null;
  return null;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    httpsGet(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const f = createWriteStream(dest);
      res.pipe(f);
      f.on("finish", () => f.close(resolve));
      f.on("error", reject);
    }).on("error", reject);
  });
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

// Extract cross-platform:
//  - Windows: PowerShell `Expand-Archive` for zips (Windows' `tar.exe` is a
//    bsdtar that misreads drive-letter paths like `D:\...` as a remote host).
//    `tar -xzf` is fine for tar.gz on Windows.
//  - macOS: bsdtar `-xf` handles BOTH zip and tar.gz.
//  - Linux (Ubuntu runners): `unzip` for zips, GNU `tar` for tar.gz.
function extractArchive(kind, archivePath, tmpDirPath) {
  const isWin = process.platform === "win32";
  const isLinux = process.platform === "linux";
  if (isWin && kind === "zip") {
    const sh = ["-NoProfile", "-Command",
      `Expand-Archive -Path "${archivePath}" -DestinationPath "${tmpDirPath}" -Force`];
    execFileSync("powershell", sh, { stdio: "inherit", windowsVerbatimArguments: false });
    return;
  }
  const isWinTar = isWin && kind !== "zip";
  execFileSync(
    isWinTar ? "tar.exe" : isLinux && kind === "zip" ? "unzip" : "tar",
    kind === "zip" ? ["-o", archivePath, "-d", tmpDirPath]
      : ["-xzf", archivePath, "-C", tmpDirPath],
    { stdio: "inherit" },
  );
}

const argIdx = process.argv.indexOf("--target");
const target = argIdx !== -1 ? process.argv[argIdx + 1] : hostTarget();
const spec = resolveTarget(target);
if (!target || !spec) {
  console.error(`[fetch-sidecar] unsupported or unknown target: ${target}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const isWin = spec.kind === "zip";
const outName = `maestro-backend-${target}${isWin ? ".exe" : ""}`;
const outPath = join(OUT_DIR, outName);

if (process.env.SIDECAR_FORCE !== "1" && existsSync(outPath)) {
  console.log(`[fetch-sidecar] ${outName} already present — skipping (SIDECAR_FORCE=1 to override).`);
  process.exit(0);
}

const tmp = `${outPath}.tmp`;
// Give the downloaded archive its real extension: PowerShell Expand-Archive
// rejects any non-.zip filename, and GNU tar/bsdtar infer format from it too.
const archive = `${outPath}.${spec.kind === "zip" ? "zip" : "tar.gz"}`;
const tmpDir = `${outPath}.dir`;

console.log(`[fetch-sidecar] ${target} <- ${DIST}/v${NODE_VERSION}/${spec.pkg}`);
try { rmSync(tmp, { force: true }); rmSync(archive, { force: true }); rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

await download(`${DIST}/v${NODE_VERSION}/${spec.pkg}`, archive);
mkdirSync(tmpDir, { recursive: true });
extractArchive(spec.kind, archive, tmpDir);

const nodeFile = isWin ? "node.exe" : "node";
const found = walk(tmpDir).find((p) => p.endsWith(`/${nodeFile}`) || p.endsWith(`\\${nodeFile}`));
if (!found) {
  console.error("[fetch-sidecar] node binary not found inside archive");
  process.exit(1);
}
renameSync(found, outPath);
try { rmSync(archive, { force: true }); rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
console.log(`[fetch-sidecar] wrote ${outName}`);
