import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";

const DATA_URL =
  "https://raw.githubusercontent.com/CrazyKidCN/maimaiDX-CN-songs-database/main/maidata.json";
const OFFICIAL_JACKET_BASE = "https://maimai.wahlap.com/maimai-mobile/img/Music/";
const GITHUB_COVER_BASE =
  "https://raw.githubusercontent.com/CrazyKidCN/maimaiDX-CN-songs-database/main/cover/";

const args = new Set(process.argv.slice(2));
const downloadCovers = args.has("--download-covers");
const useGithubCovers = args.has("--github-covers");
const root = process.cwd();
const outputPath = join(root, "public", "data", "importedSongs.json");
const coverDir = join(root, "public", "assets", "jackets", "cn-db");

const sourceData = await fetchJson(DATA_URL);
const songs = [];

if (downloadCovers) {
  mkdirSync(coverDir, { recursive: true });
}

for (const item of sourceData) {
  const imageFile = String(item.image_file ?? "").trim();
  const jacketUrl = `${useGithubCovers ? GITHUB_COVER_BASE : OFFICIAL_JACKET_BASE}${imageFile}`;
  const localJacket = `/assets/jackets/cn-db/${imageFile}`;

  songs.push({
    id: makeId(item, songs.length),
    title: clean(item.title),
    artist: clean(item.artist),
    category: normalizeCategory(clean(item.category)),
    version: clean(item.version) || "unknown",
    jacket: downloadCovers ? localJacket : jacketUrl,
    bpm: 0,
    charts: makeCharts(item)
  });
}

if (downloadCovers) {
  await mapLimit(
    songs
      .map((song) => {
        const imageFile = basename(song.jacket);
        const url = `${useGithubCovers ? GITHUB_COVER_BASE : OFFICIAL_JACKET_BASE}${imageFile}`;
        return { url, destination: join(coverDir, imageFile) };
      })
      .filter(({ destination }) => !existsSync(destination)),
    8,
    ({ url, destination }) => downloadFile(url, destination)
  );
}

writeFileSync(outputPath, `${JSON.stringify(songs, null, 2)}\n`, "utf8");
console.log(`Imported ${songs.length} songs to ${outputPath}`);
console.log(downloadCovers ? `Covers saved to ${coverDir}` : "Covers use remote URLs. Add --download-covers to cache them locally.");

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "maimai-music-cup-cn-db-importer/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "maimai-music-cup-cn-db-importer/0.1"
    }
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await pipeline(response.body, createWriteStream(destination));
}

async function mapLimit(items, limit, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(workers);
}

function makeCharts(item) {
  return [
    ...makeChartSet(item, "standard", "lev"),
    ...makeChartSet(item, "dx", "dx_lev")
  ];
}

function makeChartSet(item, type, prefix) {
  const chartKeys = [
    ["bas", "Basic"],
    ["adv", "Advanced"],
    ["exp", "Expert"],
    ["mas", "Master"],
    ["remas", "Re:Master"]
  ];

  return chartKeys
    .map(([key, difficulty]) => {
      const level = clean(item[`${prefix}_${key}`]);
      if (!level) {
        return null;
      }
      return {
        difficulty,
        level,
        designer: "maimaiNET",
        type
      };
    })
    .filter(Boolean);
}

function makeId(item, index) {
  const imageFile = clean(item.image_file).replace(/\.[^.]+$/, "");
  if (imageFile) {
    return imageFile;
  }
  return `${slugify(item.title)}-${index + 1}`;
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCategory(category) {
  if (category === "niconico＆VOCALOID™") {
    return "niconico";
  }
  return category || "未分类";
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
