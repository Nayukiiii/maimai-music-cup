import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const options = parseArgs(process.argv.slice(2));
const songs = readJson(resolve("src/data/importedSongs.json"));
const shippedSources = readJson(resolve("src/data/youtubeSources.json"));
const outputPath = resolve(options.output);
const bundle = loadBundle(outputPath);
const eligible = songs.filter((song) => !options.onlyUnmapped || !shippedSources[song.id]);
const selected = eligible.slice(options.offset, options.limit ? options.offset + options.limit : undefined);

await verifyYtDlp();

console.log(`曲库 ${songs.length} 首，本轮计划扫描 ${selected.length} 首，候选数 ${options.candidates}。`);
console.log(`输出：${outputPath}`);
console.log("仅提取搜索结果元数据，不下载视频或音频；Ctrl+C 可停止，下次会从检查点继续。");

let completed = 0;
let skipped = 0;
let failed = 0;

for (const [index, song] of selected.entries()) {
  if (!options.force && Object.hasOwn(bundle.candidates, song.id)) {
    skipped += 1;
    continue;
  }

  const query = `${song.title} ${song.artist} maimai`;
  const marker = `[${index + 1}/${selected.length}] ${song.title}`;
  try {
    const entries = await searchYouTube(query, options.candidates, options.timeout);
    bundle.candidates[song.id] = entries.map((entry) => ({
      videoId: entry.id,
      title: entry.title || entry.id,
      channelTitle: entry.channel || entry.uploader || "未知频道",
      thumbnail: entry.thumbnail || pickThumbnail(entry.thumbnails, entry.id),
      query
    }));
    delete bundle.errors[song.id];
    completed += 1;
    console.log(`${marker} → ${bundle.candidates[song.id].length} 条`);
  } catch (error) {
    bundle.errors[song.id] = error instanceof Error ? error.message : String(error);
    failed += 1;
    console.error(`${marker} → 失败：${bundle.errors[song.id]}`);
  }

  bundle.generatedAt = new Date().toISOString();
  bundle.songCount = songs.length;
  writeCheckpoint(outputPath, bundle);
  if (options.delay > 0) await wait(options.delay);
}

console.log(`完成：新增 ${completed}，已有跳过 ${skipped}，失败 ${failed}。`);
console.log("打开 /admin，点击“导入候选包”选择该 JSON，即可开始键盘审核。");

function parseArgs(args) {
  const values = {
    output: "youtubeCandidates.json",
    candidates: 5,
    offset: 0,
    limit: 0,
    delay: 900,
    timeout: 90000,
    onlyUnmapped: true,
    force: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--output" && next) values.output = next, index += 1;
    else if (arg === "--candidates" && next) values.candidates = clamp(Number(next), 1, 10), index += 1;
    else if (arg === "--offset" && next) values.offset = Math.max(0, Number(next) || 0), index += 1;
    else if (arg === "--limit" && next) values.limit = Math.max(0, Number(next) || 0), index += 1;
    else if (arg === "--delay" && next) values.delay = Math.max(0, Number(next) || 0), index += 1;
    else if (arg === "--timeout" && next) values.timeout = Math.max(10000, Number(next) || 90000), index += 1;
    else if (arg === "--include-mapped") values.onlyUnmapped = false;
    else if (arg === "--force") values.force = true;
    else if (arg === "--help") {
      console.log("npm run candidates:generate -- [--limit 100] [--offset 0] [--candidates 5] [--delay 900] [--output youtubeCandidates.json] [--force] [--include-mapped]");
      process.exit(0);
    }
  }
  return values;
}

function searchYouTube(query, count, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const executable = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
    const child = spawn(executable, [
      "--dump-single-json",
      "--flat-playlist",
      "--playlist-end",
      String(count),
      "--skip-download",
      "--no-warnings",
      `ytsearch${count}:${query}`
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);

    child.stdout.on("data", (chunk) => stdout += chunk);
    child.stderr.on("data", (chunk) => stderr += chunk);
    child.on("error", (error) => {
      clearTimeout(timer);
      if (error.code === "ENOENT") reject(new Error("找不到 yt-dlp，请先安装并确认命令可在终端运行"));
      else reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp 退出码 ${code}`));
        return;
      }
      try {
        const payload = JSON.parse(stdout);
        resolvePromise((payload.entries || []).filter((entry) => entry?.id));
      } catch {
        reject(new Error("无法解析 yt-dlp 返回的 JSON"));
      }
    });
  });
}

function verifyYtDlp() {
  return new Promise((resolvePromise, reject) => {
    const executable = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
    const child = spawn(executable, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let version = "";
    child.stdout.on("data", (chunk) => version += chunk);
    child.on("error", () => reject(new Error("找不到 yt-dlp。请先安装，并确认 `yt-dlp --version` 可以运行。")));
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`yt-dlp ${version.trim()}`);
        resolvePromise();
      } else reject(new Error("yt-dlp 无法启动"));
    });
  });
}

function loadBundle(path) {
  if (existsSync(path)) {
    const current = readJson(path);
    if (current?.version === 1 && current?.candidates) return current;
    throw new Error(`已有文件格式不正确：${path}`);
  }
  return { version: 1, generatedAt: new Date().toISOString(), songCount: songs.length, candidates: {}, errors: {} };
}

function writeCheckpoint(path, value) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function pickThumbnail(thumbnails, videoId) {
  const available = Array.isArray(thumbnails) ? thumbnails.filter((item) => item?.url) : [];
  return available.at(-1)?.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
