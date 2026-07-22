import importedSongs from "./importedSongs.json";
import { mockSongs } from "./mockSongs";
import { Song } from "../types";

export const songs: Song[] = importedSongs.length > 0 ? (importedSongs as Song[]) : mockSongs;
export const usingImportedSongs = importedSongs.length > 0;
