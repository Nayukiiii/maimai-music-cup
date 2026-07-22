export type CupMode = "song" | "chart";

export type Difficulty = "Basic" | "Advanced" | "Expert" | "Master" | "Re:Master";

export interface Chart {
  difficulty: Difficulty;
  level: string;
  constant?: number;
  designer: string;
  type?: "standard" | "dx";
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  category: string;
  version: string;
  jacket: string;
  previewAudio?: string;
  bpm: number;
  charts: Chart[];
}

export interface CupFilters {
  mode: CupMode;
  categories: string[];
  versions: string[];
  difficulties: Difficulty[];
  minLevel: string;
  maxLevel: string;
  seed: string;
}

export interface CupEntry {
  id: string;
  songId: string;
  title: string;
  artist: string;
  category: string;
  version: string;
  jacket: string;
  previewAudio?: string;
  bpm: number;
  chart?: Chart;
}

export interface MatchRecord {
  round: string;
  matchNumber: number;
  winner: CupEntry;
  loser: CupEntry;
}
