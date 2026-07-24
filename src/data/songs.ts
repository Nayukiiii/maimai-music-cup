import { mockSongs } from "./mockSongs";
import type { Song } from "../types";

export type SongCatalog = {
  songs: Song[];
  usingImportedSongs: boolean;
  error?: string;
};

export const SONG_CATALOG_URL = "/data/importedSongs.json";

// Compatibility for admin files that are currently excluded from the app entry.
// The public app should use loadSongCatalog() so the large real catalog stays out
// of the first JavaScript bundle.
export const songs: Song[] = mockSongs;
export const usingImportedSongs = false;

export async function loadSongCatalog(): Promise<SongCatalog> {
  try {
    const response = await fetch(SONG_CATALOG_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("曲库 JSON 为空");
    }

    return { songs: data as Song[], usingImportedSongs: true };
  } catch (error) {
    console.warn("Failed to load imported song catalog, falling back to mock songs.", error);
    return {
      songs: mockSongs,
      usingImportedSongs: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
