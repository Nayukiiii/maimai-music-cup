import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const siteUrl = (process.env.SITE_URL || "https://maimai.utautai.org").replace(/\/+$/, "");
const strict = process.argv.includes("--strict");
const jacketThumbVersion = "20260724";
const root = process.cwd();
const distIndex = path.join(root, "dist/index.html");
const catalogPath = path.join(root, "public/data/importedSongs.json");
const endpoints = new Set([
  "/",
  "/data/importedSongs.json",
  "/data/catalogMeta.json",
  "/data/filterIndex.json",
  "/data/presetPools.json",
  "/data/drawCache.json",
  "/data/siteReport.json"
]);

if (fs.existsSync(distIndex)) {
  const html = fs.readFileSync(distIndex, "utf8");
  for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
    endpoints.add(match[1]);
  }
}

if (fs.existsSync(catalogPath)) {
  const songs = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  for (const song of songs.slice(0, 24)) {
    if (song.jacket) endpoints.add(deriveThumb(song.jacket) || song.jacket);
    if (song.previewAudio) endpoints.add(song.previewAudio);
  }
}

let ok = 0;
let failed = 0;
for (const endpoint of endpoints) {
  const url = endpoint.startsWith("http") ? endpoint : `${siteUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  try {
    const response = await fetch(url, {
      headers: {
        "accept-encoding": "gzip, br",
        "user-agent": "maimai-music-cup-prewarmer/1.0"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await response.arrayBuffer();
    ok += 1;
    console.log(`warm ${response.status} ${url}`);
  } catch (error) {
    failed += 1;
    console.warn(`warm failed ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(`Prewarm complete: ok ${ok}, failed ${failed}`);
if (failed && strict) process.exitCode = 1;

function deriveThumb(jacket) {
  const match = jacket.match(/^\/assets\/jackets\/jp-db\/(.+)\.webp$/);
  if (!match) return "";
  return `/assets/jackets-sm/jp-db/${match[1]}.webp?v=${jacketThumbVersion}`;
}
