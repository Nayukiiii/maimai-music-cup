import { Check, Disc3, Gauge, Sparkles, Volume2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import { CupEntry } from "../types";

const difficultyClass: Record<string, string> = {
  Basic: "basic",
  Advanced: "advanced",
  Expert: "expert",
  Master: "master",
  "Re:Master": "remaster"
};

interface SongCardProps {
  entry: CupEntry;
  mode?: "compact" | "normal" | "duel";
  selected?: boolean;
  disabled?: boolean;
  rankLabel?: string;
  onSelect?: (entry: CupEntry) => void;
}

export function SongCard({ entry, mode = "normal", selected, disabled, rankLabel, onSelect }: SongCardProps) {
  const clickable = Boolean(onSelect) && !disabled;
  const difficulty = entry.chart?.difficulty;

  return (
    <article
      className={`song-card ${mode} ${clickable ? "clickable" : ""} ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
      role={onSelect ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-disabled={disabled}
      aria-pressed={onSelect ? selected : undefined}
      onClick={() => clickable && onSelect?.(entry)}
      onKeyDown={(event) => handleKeyDown(event, clickable, () => onSelect?.(entry))}
    >
      <span className="jacket-wrap">
        <img src={entry.jacket} alt={`${entry.title} jacket`} className="jacket" />
        {selected ? (
          <span className="selected-mark">
            <Check size={18} />
          </span>
        ) : null}
        {rankLabel ? <span className="rank-label">{rankLabel}</span> : null}
      </span>

      <span className="song-meta">
        <span className="title-line">{entry.title}</span>
        <span className="artist-line">{entry.artist}</span>
      </span>

      <span className="tag-row">
        <span className="pill cyan">
          <Disc3 size={13} />
          {entry.category}
        </span>
        <span className="pill yellow">{entry.version}</span>
      </span>

      {entry.chart ? (
        <span className="chart-panel">
          <span className={`difficulty ${difficultyClass[difficulty ?? ""]}`}>{difficulty}</span>
          <span className="chart-stat">
            <Gauge size={14} />
            Lv {entry.chart.level}
            {entry.chart.type ? ` / ${entry.chart.type.toUpperCase()}` : ""}
          </span>
          <span className="designer">
            <Sparkles size={14} />
            {entry.chart.designer}
          </span>
        </span>
      ) : (
        <span className="song-stats">BPM {entry.bpm}</span>
      )}

      {entry.previewAudio ? (
        <span className="audio-preview" onClick={(event) => event.stopPropagation()}>
          <span>
            <Volume2 size={14} />
            Preview
          </span>
          <audio controls preload="none" src={entry.previewAudio} />
        </span>
      ) : null}
    </article>
  );
}

function handleKeyDown(event: KeyboardEvent<HTMLElement>, clickable: boolean, onSelect: () => void) {
  if (!clickable) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect();
  }
}
