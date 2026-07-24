import { mockSongs } from "./mockSongs";
import type { Song } from "../types";

export type SongCatalog = {
  songs: Song[];
  usingImportedSongs: boolean;
  meta?: CatalogMeta;
  presetPools?: PresetPools;
  siteReport?: SiteReport;
  error?: string;
};

export type CatalogMeta = {
  songCount: number;
  chartCount: number;
  categories: CountItem[];
  versions: CountItem[];
  levels: string[];
  constantBounds: { min: number; max: number } | null;
};

export type PresetPools = {
  presets: {
    id: string;
    uniqueSongCount: number;
    entryCount: number;
    playable: boolean;
  }[];
};

export type SiteReport = {
  status: "ok" | "warn" | string;
  summary: {
    songs: number;
    charts: number;
    presets: number;
    playablePresets: number;
  };
  warnings: string[];
};

type CountItem = {
  name: string;
  count: number;
};

export const SONG_CATALOG_URL = "/data/importedSongs.json";
const CATALOG_META_URL = "/data/catalogMeta.json";
const PRESET_POOLS_URL = "/data/presetPools.json";
const SITE_REPORT_URL = "/data/siteReport.json";
const JACKET_THUMB_VERSION = "20260724";

// Compatibility for admin files that are currently excluded from the app entry.
// The public app should use loadSongCatalog() so the large real catalog stays out
// of the first JavaScript bundle.
export const songs: Song[] = mockSongs;
export const usingImportedSongs = false;

export async function loadSongCatalog(): Promise<SongCatalog> {
  try {
    const [response, metaResult, presetResult, reportResult] = await Promise.all([
      fetch(SONG_CATALOG_URL),
      readOptionalJson<CatalogMeta>(CATALOG_META_URL),
      readOptionalJson<PresetPools>(PRESET_POOLS_URL),
      readOptionalJson<SiteReport>(SITE_REPORT_URL)
    ]);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("曲库 JSON 为空");
    }

    return {
      songs: addDerivedAssets(data as Song[]),
      usingImportedSongs: true,
      meta: metaResult,
      presetPools: presetResult,
      siteReport: reportResult
    };
  } catch (error) {
    console.warn("Failed to load imported song catalog, falling back to mock songs.", error);
    return {
      songs: mockSongs,
      usingImportedSongs: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function readOptionalJson<T>(url: string): Promise<T | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

function addDerivedAssets(songs: Song[]) {
  return songs.map((song) => ({
    ...song,
    jacketThumb: deriveJacketThumb(song.jacket)
  }));
}

function deriveJacketThumb(jacket: string) {
  const match = jacket.match(/^\/assets\/jackets\/jp-db\/(.+)\.webp$/);
  if (!match) return undefined;
  return `/assets/jackets-sm/jp-db/${match[1]}.webp?v=${JACKET_THUMB_VERSION}`;
}
