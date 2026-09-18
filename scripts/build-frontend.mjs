#!/usr/bin/env node
/**
 * Cross-platform frontend build for the Tauri desktop pipeline.
 *
 * We can't use the workspace's `with-app-env.mjs vite build` wrapper on a native
 * Windows runner: it `spawn("vite")`s, and on Windows the `vite` command is a
 * `.cmd` shim that plain spawn() can't resolve. Instead we run Vite's CLI
 * entrypoint directly under `node` (`node node_modules/vite/bin/vite.js build`),
 * which triggers the full multi-environment build (client + nitro SSR/server)
 * and is byte-for-byte identical on Windows / macOS / Linux.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

if (process.env.VITE_AUTH_ENABLED === undefined) {
  process.env.VITE_AUTH_ENABLED = "false";
}

const viteCli = join(ROOT, "node_modules", "vite", "bin", "vite.js");
try {
  execFileSync(process.execPath, [viteCli, "build"], { stdio: "inherit" });
} catch (err) {
  console.error("[build-frontend] vite build failed:", err);
  process.exit(1);
}

// Reconcile SSR-emitted CSS refs with what Nitro actually publishes. Pass the
// path RELATIVE to cwd (this script runs from the repo root); the fix script
// joins it onto cwd itself and must not be given an absolute path.
const fix = join(ROOT, "scripts", "fix-ssr-css-refs.mjs");
try {
  execFileSync(process.execPath, [fix, ".output"], { stdio: "inherit" });
} catch (err) {
  console.error("[build-frontend] fix-ssr-css-refs failed:", err);
  process.exit(1);
}

// Ship the PGlite engine assets the embedded PGLite fallback opens at runtime
// (they resolve next to the bundled chunk, and Rollup doesn't emit them).
const pgliteAssets = join(ROOT, "scripts", "copy-pglite-assets.mjs");
try {
  execFileSync(process.execPath, [pgliteAssets], { stdio: "inherit" });
} catch (err) {
  console.error("[build-frontend] copy-pglite-assets failed:", err);
  process.exit(1);
}
console.log("[build-frontend] frontend .output ready.");
