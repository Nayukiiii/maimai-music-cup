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
  rawMusicId?: string;
  assetId?: string;
  title: string;
  artist: string;
  category: string;
  version: string;
  versionId?: number | null;
  jacket: string;
  jacketThumb?: string;
  previewAudio?: string;
  bpm: number;
  chartType?: "standard" | "dx";
  charts: Chart[];
}

export interface CupFilters {
  mode: CupMode;
  categories: string[];
  versions: string[];
  difficulties: Difficulty[];
  rangeMode: "level" | "constant";
  minLevel: string;
  maxLevel: string;
  minConstant: number;
  maxConstant: number;
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
  jacketThumb?: string;
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
