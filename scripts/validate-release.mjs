import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const requireAssets = process.argv.includes("--require-assets");
const privateAssetRoot = path.resolve(process.env.MMC_PRIVATE_ASSET_ROOT || path.join(root, "deploy/private-assets"));
const assetRoots = [path.join(root, "public"), privateAssetRoot];
const songsPath = path.join(root, "src/data/importedSongs.json");
const youtubePath = path.join(root, "src/data/youtubeSources.json");
const songs = JSON.parse(fs.readFileSync(songsPath, "utf8"));
const youtubeSources = JSON.parse(fs.readFileSync(youtubePath, "utf8"));
const difficulties = new Set(["Basic", "Advanced", "Expert", "Master", "Re:Master"]);
const errors = [];
const warnings = [];
const songIds = new Set();
const chartPools = new Map();
let chartCount = 0;
let missingJackets = 0;
let missingPreviews = 0;

if (!Array.isArray(songs) || songs.length < 48) {
  errors.push(`曲库至少需要 48 首，当前为 ${Array.isArray(songs) ? songs.length : "非数组"}`);
}

for (const [songIndex, song] of songs.entries()) {
  const label = song?.id || `index:${songIndex}`;
  if (!song || typeof song !== "object") {
    errors.push(`${label} 不是有效歌曲对象`);
    continue;
  }
  if (!nonEmpty(song.id)) errors.push(`${label} 缺少 id`);
  if (songIds.has(song.id)) errors.push(`重复歌曲 id：${song.id}`);
  songIds.add(song.id);
  for (const key of ["title", "artist", "category", "version", "jacket"]) {
    if (!nonEmpty(song[key])) errors.push(`${label} 缺少 ${key}`);
  }
  if (!Array.isArray(song.charts) || song.charts.length === 0) {
    errors.push(`${label} 没有可用谱面`);
    continue;
  }

  if (!assetExists(song.jacket)) missingJackets += 1;
  if (song.previewAudio && !assetExists(song.previewAudio)) missingPreviews += 1;

  const chartKeys = new Set();
  for (const chart of song.charts) {
    chartCount += 1;
    if (!difficulties.has(chart.difficulty)) {
      errors.push(`${label} 含未知难度：${chart.difficulty}`);
    }
    if (!/^\d{1,2}\+?$/.test(String(chart.level || ""))) {
      errors.push(`${label}/${chart.difficulty} 等级字段无效：${chart.level}`);
    }
    if (chart.constant !== undefined && (!Number.isFinite(chart.constant) || chart.constant < 0 || chart.constant > 20)) {
      errors.push(`${label}/${chart.difficulty} 定数无效：${chart.constant}`);
    }
    const type = chart.type || song.chartType || "dx";
    const semanticKey = `${chart.difficulty}::${type}`;
    if (chartKeys.has(semanticKey)) {
      errors.push(`${label} 重复同一谱面：${semanticKey}`);
    }
    chartKeys.add(semanticKey);
    chartPools.set(chart.difficulty, (chartPools.get(chart.difficulty) || 0) + 1);
  }
}

for (const [songId, source] of Object.entries(youtubeSources)) {
  if (!songIds.has(songId)) warnings.push(`YouTube 映射指向不存在歌曲：${songId}`);
  if (!source || !/^[A-Za-z0-9_-]{11}$/.test(source.videoId || "")) {
    errors.push(`YouTube 映射视频 ID 无效：${songId}`);
  }
  if (source?.start !== undefined && (!Number.isInteger(source.start) || source.start < 0)) {
    errors.push(`YouTube 映射开始时间无效：${songId}`);
  }
}

for (const difficulty of difficulties) {
  const count = chartPools.get(difficulty) || 0;
  if (count < 48) warnings.push(`${difficulty} 仅有 ${count} 张谱面，无法在全曲库范围组成 48 强`);
}

if (missingJackets) {
  const message = `${missingJackets}/${songs.length} 张封面文件未部署`;
  (requireAssets ? errors : warnings).push(message);
}
if (missingPreviews) {
  const referenced = songs.filter((song) => song.previewAudio).length;
  const message = `${missingPreviews}/${referenced} 个已引用试听文件未部署`;
  (requireAssets ? errors : warnings).push(message);
}

console.log(`曲库：${songs.length} 首 / ${chartCount} 张谱面`);
console.log(`谱面池：${[...chartPools.entries()].map(([name, count]) => `${name} ${count}`).join(" · ")}`);
console.log(`YouTube 映射：${Object.keys(youtubeSources).length} 首`);
console.log(`本地资源：缺封面 ${missingJackets} · 缺已引用试听 ${missingPreviews}`);
for (const warning of warnings) console.warn(`WARN ${warning}`);
for (const error of errors) console.error(`ERROR ${error}`);

if (errors.length) {
  console.error(`发布预检失败：${errors.length} 个错误`);
  process.exit(1);
}

console.log(
  requireAssets
    ? `私有资源预检通过（资源根目录：${privateAssetRoot}）。`
    : "数据预检通过；JP 版权资源为可选的部署机私有挂载，不进入仓库或镜像。"
);

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assetExists(webPath) {
  if (!nonEmpty(webPath)) return false;
  if (/^https?:\/\//i.test(webPath)) return true;
  const relative = webPath.replace(/^\/+/, "");
  return assetRoots.some((assetRoot) => fs.existsSync(path.join(assetRoot, relative)));
}
