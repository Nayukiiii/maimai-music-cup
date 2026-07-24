import { CupEntry, CupFilters, Song } from "../types";

const roundNamesBySize: Record<number, string> = {
  32: "32 强",
  16: "16 强",
  8: "8 强",
  4: "半决赛",
  2: "决赛"
};

export function getRoundName(size: number) {
  return roundNamesBySize[size] ?? `${size} 强`;
}

export function toCupEntries(songs: Song[], filters: CupFilters): CupEntry[] {
  return songs.flatMap((song) => {
    const categoryPass = filters.categories.length === 0 || filters.categories.includes(song.category);
    const versionPass = filters.versions.length === 0 || filters.versions.includes(song.version);

    if (!categoryPass || !versionPass) {
      return [];
    }

    if (filters.mode === "song") {
      return [
        {
          id: song.id,
          songId: song.id,
          title: song.title,
          artist: song.artist,
          category: song.category,
          version: song.version,
          jacket: song.jacket,
          jacketThumb: song.jacketThumb,
          previewAudio: song.previewAudio,
          bpm: song.bpm
        }
      ];
    }

    const chartCupDifficulty = filters.difficulties[0];
    const matchingCharts = song.charts
      .filter((chart) => !chartCupDifficulty || chart.difficulty === chartCupDifficulty)
      .filter((chart) => {
        if (filters.rangeMode === "constant") {
          return typeof chart.constant === "number" && chart.constant >= filters.minConstant && chart.constant <= filters.maxConstant;
        }
        return isLevelInRange(chart.level, filters.minLevel, filters.maxLevel);
      });

    const uniqueCharts = new Map(
      matchingCharts.map((chart) => [`${chart.difficulty}::${chart.type ?? song.chartType ?? "dx"}`, chart])
    );

    return [...uniqueCharts.entries()]
      .map(([chartKey, chart]) => ({
        id: `${song.id}::${chartKey}`,
        songId: song.id,
        title: song.title,
        artist: song.artist,
        category: song.category,
        version: song.version,
        jacket: song.jacket,
        jacketThumb: song.jacketThumb,
        previewAudio: song.previewAudio,
        bpm: song.bpm,
        chart
      }));
  });
}

export function compareLevel(a: string, b: string) {
  return levelRank(a) - levelRank(b);
}

function isLevelInRange(level: string, minLevel: string, maxLevel: string) {
  const current = levelRank(level);
  return current >= levelRank(minLevel) && current <= levelRank(maxLevel);
}

function levelRank(level: string) {
  const normalized = String(level).trim();
  const match = normalized.match(/^(\d{1,2})(\+)?$/);
  if (!match) {
    return 0;
  }
  return Number(match[1]) * 2 + (match[2] ? 1 : 0);
}

export function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed || "maimai-cup"));
  return [...items]
    .map((item, index) => ({ item, index, score: rand() }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ item }) => item);
}

export function makeGroups(entries: CupEntry[], seed: string) {
  return chunk(selectUniqueEntries(entries, seed, 48), 4);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function hashSeed(input: string) {
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

function mulberry32(seedFactory: () => number) {
  let seed = seedFactory();
  return () => {
    seed += 0x6d2b79f5;
    let next = seed;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function selectUniqueEntries(entries: CupEntry[], seed: string, count: number) {
  const shuffled = shuffleWithSeed(entries, seed);
  const selected: CupEntry[] = [];
  const usedEntryIds = new Set<string>();
  // 同一首歌整届只能出现一次：谱面杯里同曲的 SD / DX 同难度谱会各生成一个参赛项，
  // 不按 songId 去重的话抽签页会出现同名同曲绘的「重复曲目」。
  const usedSongIds = new Set<string>();

  for (const entry of shuffled) {
    if (usedEntryIds.has(entry.id) || usedSongIds.has(entry.songId)) {
      continue;
    }
    selected.push(entry);
    usedEntryIds.add(entry.id);
    usedSongIds.add(entry.songId);
    if (selected.length === count) {
      return selected;
    }
  }

  return selected;
}
