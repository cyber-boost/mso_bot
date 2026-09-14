#!/usr/bin/env node
/**
 * Cross-platform pre-bundle check for the Tauri desktop build. The frontend
 * `.output` bundle is produced explicitly by the workflow (`npm run build` +
 * `scripts/fix-ssr-css-refs.mjs`) and also verified here. We avoid the
 * workspace's with-app-env wrapper here because `spawn("vite")` cannot resolve
 * the `.cmd` shim on native Windows.
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = join(ROOT, ".output", "server", "index.mjs");
const hasPublic = existsSync(join(ROOT, ".output", "public"));

if (!existsSync(serverEntry) || !hasPublic) {
  console.error(
    "[desktop] .output is missing. Run: npm run build && node scripts/fix-ssr-css-refs.mjs .output",
  );
  process.exit(1);
}
console.log("[desktop] .output verified (server + public present).");
