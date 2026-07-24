import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const dataDir = path.join(root, "public/data");
const songsPath = path.join(dataDir, "importedSongs.json");
const outPaths = {
  catalogMeta: path.join(dataDir, "catalogMeta.json"),
  filterIndex: path.join(dataDir, "filterIndex.json"),
  presetPools: path.join(dataDir, "presetPools.json"),
  drawCache: path.join(dataDir, "drawCache.json"),
  siteReport: path.join(dataDir, "siteReport.json")
};

const songs = JSON.parse(fs.readFileSync(songsPath, "utf8"));
const generatedAt = new Date().toISOString();
const presets = [
  preset("song-all", "全曲本命杯", { mode: "song" }),
  preset("song-original", "maimai 原创杯", { mode: "song", categories: ["maimai"] }),
  preset("song-vocaloid", "nico/V 家杯", { mode: "song", categories: ["niconicoボーカロイド"] }),
  preset("song-toho", "东方 Project 杯", { mode: "song", categories: ["東方Project"] }),
  preset("chart-exp-12", "红谱主战场", { mode: "chart", difficulties: ["Expert"], minLevel: "12", maxLevel: "13+" }),
  preset("chart-master-13", "紫谱本命战", { mode: "chart", difficulties: ["Master"], minLevel: "13", maxLevel: "13+" }),
  preset("chart-master-14", "紫谱神仙杯", { mode: "chart", difficulties: ["Master"], minLevel: "14", maxLevel: "14+" }),
  preset("chart-remaster", "白谱精英杯", { mode: "chart", difficulties: ["Re:Master"], minLevel: "13", maxLevel: "14+" }),
  preset("new-era", "近代新曲杯", { mode: "song", versions: ["BUDDiES", "BUDDiES PLUS", "PRiSM", "PRiSM PLUS", "CiRCLE", "CiRCLE PLUS"] }),
  preset("classic", "怀旧街机杯", {
    mode: "song",
    versions: ["maimai", "maimai PLUS", "GreeN", "GreeN PLUS", "ORANGE", "ORANGE PLUS", "PiNK", "PiNK PLUS", "MURASAKi", "MURASAKi PLUS", "MiLK", "MiLK PLUS", "FiNALE"]
  })
];

const categories = countBy(songs.map((song) => song.category));
const versions = countBy(songs.map((song) => song.version));
const chartEntries = songs.flatMap((song) => song.charts.map((chart) => ({ song, chart })));
const levels = unique(chartEntries.map(({ chart }) => chart.level)).sort(compareLevel);
const constants = chartEntries.map(({ chart }) => chart.constant).filter(isNumber);
const difficultyStats = Object.fromEntries(
  ["Basic", "Advanced", "Expert", "Master", "Re:Master"].map((difficulty) => {
    const entries = chartEntries.filter(({ chart }) => chart.difficulty === difficulty);
    return [
      difficulty,
      {
        chartCount: entries.length,
        songCount: new Set(entries.map(({ song }) => song.id)).size,
        levels: countBy(entries.map(({ chart }) => chart.level)),
        designers: countBy(entries.map(({ chart }) => chart.designer || "-")).slice(0, 12)
      }
    ];
  })
);

const catalogMeta = {
  version: 1,
  generatedAt,
  songCount: songs.length,
  chartCount: chartEntries.length,
  categories,
  versions,
  levels,
  constantBounds: constants.length ? { min: Math.min(...constants), max: Math.max(...constants) } : null,
  difficulties: difficultyStats
};

const filterIndex = {
  version: 1,
  generatedAt,
  byCategory: mapSongIdsBy("category"),
  byVersion: mapSongIdsBy("version"),
  byDifficulty: Object.fromEntries(
    Object.keys(difficultyStats).map((difficulty) => [
      difficulty,
      songs.filter((song) => song.charts.some((chart) => chart.difficulty === difficulty)).map((song) => song.id)
    ])
  ),
  byLevel: Object.fromEntries(levels.map((level) => [level, songs.filter((song) => song.charts.some((chart) => chart.level === level)).map((song) => song.id)]))
};

const presetPools = {
  version: 1,
  generatedAt,
  presets: presets.map((item) => {
    const entries = toCupEntries(songs, item.filters);
    const uniqueSongIds = unique(entries.map((entry) => entry.songId));
    return {
      id: item.id,
      title: item.title,
      filters: item.filters,
      entryCount: entries.length,
      uniqueSongCount: uniqueSongIds.length,
      playable: uniqueSongIds.length >= 48,
      sampleSongIds: uniqueSongIds.slice(0, 96)
    };
  })
};

const drawSeeds = ["OPENING", "SAKURA", "DELUXE", "BUDDIES", "CIRCLE", "PRISM"];
const drawCache = {
  version: 1,
  generatedAt,
  draws: Object.fromEntries(
    presetPools.presets
      .filter((item) => item.playable)
      .map((item) => [
        item.id,
        Object.fromEntries(
          drawSeeds.map((seed) => {
            const groups = chunk(selectUniqueEntries(toCupEntries(songs, { ...item.filters, seed }), JSON.stringify({ preset: item.id, seed }), 48), 4);
            return [seed, groups.map((group) => group.map((entry) => entry.id))];
          })
        )
      ])
  )
};

const reportWarnings = [
  ...presetPools.presets.filter((item) => !item.playable).map((item) => `预设不足 48：${item.title}（${item.uniqueSongCount}）`),
  ...Object.entries(difficultyStats)
    .filter(([, stats]) => stats.songCount < 48)
    .map(([difficulty, stats]) => `${difficulty} 谱面池不足 48：${stats.songCount}`)
];
const siteReport = {
  version: 1,
  generatedAt,
  status: reportWarnings.length ? "warn" : "ok",
  summary: {
    songs: songs.length,
    charts: chartEntries.length,
    presets: presetPools.presets.length,
    playablePresets: presetPools.presets.filter((item) => item.playable).length
  },
  warnings: reportWarnings,
  checks: {
    duplicateSongIds: findDuplicates(songs.map((song) => song.id)),
    missingJackets: songs.filter((song) => !song.jacket).map((song) => song.id),
    missingPreviews: songs.filter((song) => !song.previewAudio).map((song) => song.id),
    missingConstants: songs.filter((song) => !song.charts.some((chart) => isNumber(chart.constant))).map((song) => song.id)
  },
  presets: presetPools.presets.map(({ id, title, uniqueSongCount, playable }) => ({ id, title, uniqueSongCount, playable }))
};

for (const [name, outputPath] of Object.entries(outPaths)) {
  writeJson(outputPath, { catalogMeta, filterIndex, presetPools, drawCache, siteReport }[name]);
}

console.log(`Precomputed catalog: ${catalogMeta.songCount} songs / ${catalogMeta.chartCount} charts`);
console.log(`Playable presets: ${siteReport.summary.playablePresets}/${siteReport.summary.presets}`);
if (reportWarnings.length) {
  console.warn(reportWarnings.map((warning) => `WARN ${warning}`).join("\n"));
}

function preset(id, title, filters) {
  return {
    id,
    title,
    filters: {
      mode: "song",
      categories: [],
      versions: [],
      difficulties: ["Expert"],
      rangeMode: "level",
      minLevel: "1",
      maxLevel: "15",
      minConstant: 1,
      maxConstant: 15,
      seed: "OPENING",
      ...filters
    }
  };
}

function toCupEntries(songList, filters) {
  return songList.flatMap((song) => {
    if (filters.categories.length && !filters.categories.includes(song.category)) return [];
    if (filters.versions.length && !filters.versions.includes(song.version)) return [];
    if (filters.mode === "song") return [{ id: song.id, songId: song.id }];
    const difficulty = filters.difficulties[0];
    const charts = song.charts
      .filter((chart) => chart.difficulty === difficulty)
      .filter((chart) => {
        if (filters.rangeMode === "constant") return isNumber(chart.constant) && chart.constant >= filters.minConstant && chart.constant <= filters.maxConstant;
        return levelRank(chart.level) >= levelRank(filters.minLevel) && levelRank(chart.level) <= levelRank(filters.maxLevel);
      });
    const uniqueCharts = new Map(charts.map((chart) => [`${chart.difficulty}::${chart.type ?? song.chartType ?? "dx"}`, chart]));
    return [...uniqueCharts.keys()].map((chartKey) => ({ id: `${song.id}::${chartKey}`, songId: song.id }));
  });
}

function selectUniqueEntries(entries, seed, count) {
  const selected = [];
  const usedSongIds = new Set();
  for (const entry of shuffleWithSeed(entries, seed)) {
    if (usedSongIds.has(entry.songId)) continue;
    selected.push(entry);
    usedSongIds.add(entry.songId);
    if (selected.length === count) return selected;
  }
  return selected;
}

function shuffleWithSeed(items, seed) {
  const rand = mulberry32(hashSeed(seed || "maimai-cup"));
  return [...items]
    .map((item, index) => ({ item, index, score: rand() }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ item }) => item);
}

function hashSeed(input) {
  let hash = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function mulberry32(seedFactory) {
  let seed = seedFactory();
  return () => {
    seed += 0x6d2b79f5;
    let next = seed;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function mapSongIdsBy(key) {
  return Object.fromEntries(unique(songs.map((song) => song[key])).map((value) => [value, songs.filter((song) => song[key] === value).map((song) => song.id)]));
}

function countBy(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).map(([name, count]) => ({ name, count }));
}

function findDuplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  values.forEach((value) => (seen.has(value) ? dupes.add(value) : seen.add(value)));
  return [...dupes];
}

function unique(values) {
  return [...new Set(values)];
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function compareLevel(a, b) {
  return levelRank(a) - levelRank(b);
}

function levelRank(level) {
  const match = String(level).trim().match(/^(\d{1,2})(\+)?$/);
  return match ? Number(match[1]) * 2 + (match[2] ? 1 : 0) : 0;
}

function writeJson(outputPath, data) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
