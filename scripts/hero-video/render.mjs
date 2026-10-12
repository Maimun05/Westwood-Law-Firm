/*
 * Renders the hero background clip frame-by-frame with headless Chrome and
 * encodes it to public/video/hero.mp4 (+ a poster JPG), using the
 * deterministic renderer in frame.html.
 *
 * The AI video generator was unavailable, so the clip is produced here from
 * the site's own brand tokens instead of a model.
 *
 * Run from the repo root:
 *   npm i --no-save ffmpeg-static puppeteer-core
 *   node scripts/hero-video/render.mjs
 *
 * Override the browser with CHROME_PATH if Chrome is not in the default spot.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

const FPS = 30;
const DURATION = 8; // seconds — must match T in frame.html
const WIDTH = 1280;
const HEIGHT = 720;

const chromePath =
  process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const framesDir = path.join(here, ".frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
fs.mkdirSync(path.join(root, "public/video"), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
  defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
});

try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(here, "frame.html")).href, { waitUntil: "load" });
  await page.waitForFunction("window.__ready === true", { timeout: 15000 });

  const total = FPS * DURATION;
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.__renderAt(t), i / FPS);
    await page.screenshot({
      path: path.join(framesDir, `frame_${String(i).padStart(4, "0")}.png`),
      type: "png",
    });
    if (i % 60 === 0) console.log(`  frame ${i}/${total}`);
  }

  // Poster = the loop's first frame, for the pre-load paint and reduced-motion.
  await page.evaluate((t) => window.__renderAt(t), 0);
  await page.screenshot({
    path: path.join(root, "public/video/hero-poster.jpg"),
    type: "jpeg",
    quality: 82,
  });
} finally {
  await browser.close();
}

const out = path.join(root, "public/video/hero.mp4");
execFileSync(
  ffmpegPath,
  [
    "-y",
    "-framerate",
    String(FPS),
    "-i",
    path.join(framesDir, "frame_%04d.png"),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "23",
    "-preset",
    "slow",
    "-movflags",
    "+faststart",
    out,
  ],
  { stdio: "inherit" },
);

fs.rmSync(framesDir, { recursive: true, force: true });
console.log("wrote", out);
