import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SHOTS = join(ROOT, "screenshots");
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

const url = process.env.SHELL_URL || "http://127.0.0.1:8077/";
await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1500);

// screenshot root
await page.screenshot({ path: join(SHOTS, "shell-root.png") });
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
console.log("ROOT body contains:", JSON.stringify(bodyText.slice(0, 120)));

// click Shell nav
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  const shell = btns.find((b) => b.textContent && b.textContent.trim().toLowerCase().includes("shell"));
  if (shell) { shell.click(); return true; }
  return false;
});
await page.waitForTimeout(1800);
console.log("Shell nav clicked:", clicked);

await page.screenshot({ path: join(SHOTS, "shell-view.png") });
const shellText = await page.evaluate(() => document.body.innerText.slice(0, 600));
console.log("SHELL body contains:", JSON.stringify(shellText.slice(0, 200)));

// check xterm canvas/textarea rendered
const hasXterm = await page.evaluate(() => {
  const t = document.querySelector(".xterm textarea, textarea.xterm-helper, xterm");
  const term = document.querySelector(".xterm");
  return { term: !!term, helper: !!t };
});
console.log("xterm present:", JSON.stringify(hasXterm));

console.log("CONSOLE ERRORS:", errors.length ? JSON.stringify(errors.slice(0,5)) : "none");

await browser.close();
