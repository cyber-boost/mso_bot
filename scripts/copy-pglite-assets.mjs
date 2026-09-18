#!/usr/bin/env node
// Ship the PGlite engine assets next to the bundled server chunk.
//
// The Nitro bundle re-resolves "pglite.wasm" / "pglite.data" (and
// "initdb.wasm" for a fresh data dir) relative to the chunk that embeds
// @electric-sql/pglite. Rollup never emits those files by itself, so the
// first DB call in production used to 500 with
//   ENOENT …/server/_libs/pglite.data
// Locate the chunk wherever the bundler named it and copy the assets beside
// it. Runs after `vite build`; desktop CI hits it through build-frontend.mjs.

import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = join(ROOT, ".output", "server");
const DIST = join(ROOT, "node_modules", "@electric-sql", "pglite", "dist");
const ASSETS = ["pglite.wasm", "pglite.data", "initdb.wasm"];
const CHUNK = "electric-sql__pglite.mjs";

/** Find the bundled pglite chunk, searching .output/server shallowly. */
function findChunkDir(dir, depth = 0) {
  if (depth > 3 || !existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === CHUNK) return dir;
    try {
      if (statSync(full).isDirectory()) {
        const found = findChunkDir(full, depth + 1);
        if (found) return found;
      }
    } catch {
      /* unreadable — skip */
    }
  }
  return null;
}

const chunkDir = findChunkDir(SERVER);
if (!chunkDir) {
  // The app builds without a DB import inlined (no routes use it). Fine.
  console.log("[pglite-assets] no pglite chunk in .output — nothing to copy");
  process.exit(0);
}

let copied = 0;
for (const asset of ASSETS) {
  const from = join(DIST, asset);
  if (!existsSync(from)) {
    console.error(`[pglite-assets] MISSING ${from}`);
    process.exit(1);
  }
  copyFileSync(from, join(chunkDir, asset));
  copied++;
}
console.log(`[pglite-assets] copied ${copied} asset(s) → ${chunkDir}`);
