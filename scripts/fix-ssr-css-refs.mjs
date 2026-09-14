#!/usr/bin/env node
/**
 * Post-build reconciliation for the Nitro node-server artifact.
 *
 * TanStack Start's SSR bundle compiles `styles.css?url` into its own (unminified)
 * copy and emits a `<link rel="stylesheet">` pointing at that SSR hash
 * (e.g. /assets/styles-XXXX.css). Nitro only publishes the *client* CSS bundle
 * to .output/public/assets/. If the SSR hash differs from the client hash, the
 * served HTML links a stylesheet that 404s, so the first paint is unstyled.
 *
 * This rewrites every `/assets/styles-<hash>.css` reference in the built server
 * to the CSS file that Nitro actually published. Safe: only touches exact asset
 * paths, only stylesheet URLs, and is idempotent across rebuilds.
 *
 * Usage: node scripts/fix-ssr-css-refs.mjs [outputDir]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_DIR = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, ".output");

const publicAssets = join(OUTPUT_DIR, "public", "assets");
const serverDir = join(OUTPUT_DIR, "server");

function listCssInPublic() {
  const names = [];
  try {
    for (const entry of readdirSync(publicAssets)) {
      if (entry.endsWith(".css")) names.push(`/assets/${entry}`);
    }
  } catch {
    /* no public assets */
  }
  return names;
}

function* walkJs(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      yield* walkJs(p);
    } else if (entry.endsWith(".mjs") || entry.endsWith(".js")) {
      yield p;
    }
  }
}

function main() {
  const shipped = new Set(listCssInPublic());
  if (shipped.size === 0) {
    console.error("[fix-ssr-css] no .css files found in " + publicAssets);
    process.exit(1);
  }
  // Choose the shipped css to use as the canonical replacement: smallest, so we
  // prefer the (minified) client bundle.
  const canonical = [...shipped].sort(
    (a, b) => getSize(a) - getSize(b),
  )[0];

  const assetRef = /\/assets\/styles-[A-Za-z0-9_-]+\.css/g;
  let filesChanged = 0;
  let replacements = 0;

  for (const file of walkJs(serverDir)) {
    let text = readFileSync(file, "utf8");
    let count = 0;
    let newText = text.replace(assetRef, (m) => {
      // Only replace references that DON'T already match a shipped file.
      if (shipped.has(m)) return m;
      count += 1;
      return canonical;
    });
    if (count > 0) {
      writeFileSync(file, newText);
      filesChanged += 1;
      replacements += count;
    }
  }

  console.log(
    `[fix-ssr-css] rewrote ${replacements} SSR css ref(s) across ${filesChanged} file(s) to ${canonical}`,
  );
}

function getSize(assetPath) {
  try {
    return statSync(join(publicAssets, assetPath.replace("/assets/", ""))).size;
  } catch {
    return Infinity;
  }
}

main();
