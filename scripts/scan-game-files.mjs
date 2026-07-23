import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "data/raw/jp");
const outputPath = resolve(process.argv[3] ?? "game-file-scan.json");
const maxSampleBytes = 96 * 1024;
const maxRows = 40;

if (!existsSync(root)) {
  console.error(`找不到目录：${root}`);
  console.error("用法：npm run game:scan -- data/raw/jp");
  process.exit(1);
}

const files = [];
walk(root, files);

const extensionStats = new Map();
const directoryStats = new Map();
const candidates = {
  metadata: [],
  jackets: [],
  audio: [],
  archives: [],
  unknownLarge: []
};

for (const file of files) {
  const ext = extname(file.path).toLowerCase() || "(no ext)";
  const rel = relative(root, file.path);
  const firstDir = rel.split(/[\\/]/)[0] || ".";

  bump(extensionStats, ext, file.size);
  bump(directoryStats, firstDir, file.size);

  if (isMetadata(file.path)) {
    candidates.metadata.push(describeTextLike(file));
  } else if (isImage(file.path)) {
    candidates.jackets.push(describeBinary(file));
  } else if (isAudio(file.path)) {
    candidates.audio.push(describeBinary(file));
  } else if (isArchive(file.path)) {
    candidates.archives.push(describeBinary(file));
  } else if (file.size >= 10 * 1024 * 1024) {
    candidates.unknownLarge.push(describeBinary(file));
  }
}

for (const key of Object.keys(candidates)) {
  candidates[key] = candidates[key]
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a) || b.size - a.size)
    .slice(0, key === "metadata" ? 80 : 50);
}

const report = {
  scannedAt: new Date().toISOString(),
  root,
  totals: {
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.size, 0)
  },
  extensionStats: topStats(extensionStats, 80),
  directoryStats: topStats(directoryStats, 80),
  candidates
};

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`扫描目录：${root}`);
console.log(`文件数量：${report.totals.files}`);
console.log(`总大小：${formatBytes(report.totals.bytes)}`);
console.log(`报告输出：${outputPath}`);
printSection("可能的曲库/谱面数据", candidates.metadata);
printSection("可能的封面图片", candidates.jackets);
printSection("可能的音频文件", candidates.audio);
printSection("可能的资源包/归档", candidates.archives);
printSection("未知大文件", candidates.unknownLarge);

function walk(dir, output) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, output);
    } else if (stat.isFile()) {
      output.push({ path, size: stat.size });
    }
  }
}

function bump(map, name, size) {
  const current = map.get(name) ?? { count: 0, bytes: 0 };
  current.count += 1;
  current.bytes += size;
  map.set(name, current);
}

function topStats(map, limit) {
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

function isMetadata(path) {
  const ext = extname(path).toLowerCase();
  return [".json", ".csv", ".tsv", ".xml", ".txt", ".yaml", ".yml", ".toml", ".ini"].includes(ext);
}

function isImage(path) {
  const ext = extname(path).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tga"].includes(ext);
}

function isAudio(path) {
  const ext = extname(path).toLowerCase();
  return [".mp3", ".ogg", ".wav", ".m4a", ".aac", ".awb", ".acb"].includes(ext);
}

function isArchive(path) {
  const ext = extname(path).toLowerCase();
  return [".zip", ".7z", ".rar", ".tar", ".gz", ".bundle", ".assets", ".resource", ".dat", ".bin"].includes(ext);
}

function describeTextLike(file) {
  const buffer = readFileSync(file.path, { flag: "r" }).subarray(0, Math.min(file.size, maxSampleBytes));
  const text = buffer.toString("utf8").replace(/\u0000/g, "");
  const compact = text.replace(/\s+/g, " ").trim().slice(0, 700);
  return {
    ...describeBinary(file),
    hints: extractHints(file.path, text),
    sample: compact
  };
}

function describeBinary(file) {
  const buffer = readFileSync(file.path, { flag: "r" }).subarray(0, Math.min(file.size, 4096));
  return {
    path: relative(root, file.path),
    name: basename(file.path),
    ext: extname(file.path).toLowerCase() || "(no ext)",
    size: file.size,
    sizeText: formatBytes(file.size),
    sha1Head: createHash("sha1").update(buffer).digest("hex").slice(0, 16)
  };
}

function extractHints(path, text) {
  const haystack = `${path}\n${text}`.toLowerCase();
  const hints = [];
  const checks = [
    ["music", "music"],
    ["title", "title"],
    ["artist", "artist"],
    ["genre/category", "genre"],
    ["genre/category", "category"],
    ["version", "version"],
    ["bpm", "bpm"],
    ["level", "level"],
    ["difficulty", "difficulty"],
    ["designer/notes", "designer"],
    ["designer/notes", "notes"],
    ["jacket", "jacket"],
    ["cue/audio", "cue"],
    ["cue/audio", "audio"]
  ];
  for (const [label, needle] of checks) {
    if (haystack.includes(needle) && !hints.includes(label)) hints.push(label);
  }
  return hints;
}

function scoreCandidate(item) {
  const name = `${item.path} ${item.sample ?? ""}`.toLowerCase();
  let score = 0;
  for (const word of ["music", "song", "楽曲", "title", "artist", "level", "difficulty", "jacket", "bpm"]) {
    if (name.includes(word.toLowerCase())) score += 5;
  }
  if (item.hints) score += item.hints.length * 2;
  if (item.ext === ".json" || item.ext === ".xml" || item.ext === ".csv") score += 3;
  return score;
}

function printSection(title, rows) {
  console.log(`\n${title}：${rows.length}`);
  for (const row of rows.slice(0, maxRows)) {
    const hints = row.hints?.length ? ` [${row.hints.join(", ")}]` : "";
    console.log(`- ${row.path} (${row.sizeText})${hints}`);
  }
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
