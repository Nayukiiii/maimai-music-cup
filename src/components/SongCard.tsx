import { Check, Disc3, Pause, Play, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, SyntheticEvent } from "react";
import { CupEntry } from "../types";

// 全站同时只允许一个试听在放，避免小组赛 4 张卡一起响
let activePreview: HTMLAudioElement | null = null;

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

const PLACEHOLDER_DESIGNERS = new Set(["maimainet", "-", "－", "ー", ""]);

export function SongCard({ entry, mode = "normal", selected, disabled, rankLabel, onSelect }: SongCardProps) {
  const [audioFailed, setAudioFailed] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clickable = Boolean(onSelect) && !disabled;
  const difficulty = entry.chart?.difficulty;
  const designer = entry.chart?.designer?.trim();
  const showDesigner = Boolean(designer) && !PLACEHOLDER_DESIGNERS.has(designer!.toLowerCase());
  const chartType = entry.chart?.type;
  const chartTypeLabel = entry.chart ? getChartTypeLabel(chartType, entry.songId) : "";
  const showBpm = Boolean(entry.bpm) && entry.bpm > 0;

  useEffect(() => {
    setAudioFailed(false);
    setAudioPlaying(false);
    return () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      if (activePreview === audio) {
        activePreview = null;
      }
    };
  }, [entry.previewAudio]);

  async function toggleAudioPreview() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      setAudioPlaying(false);
      return;
    }
    if (activePreview && activePreview !== audio) {
      activePreview.pause();
    }
    activePreview = audio;
    try {
      await audio.play();
      setAudioPlaying(true);
    } catch {
      setAudioFailed(true);
      setAudioPlaying(false);
    }
  }

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
        <img
          src={entry.jacket}
          alt={`${entry.title} jacket`}
          className="jacket"
          loading="lazy"
          onError={useFallbackJacket}
        />
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
          <span className="chart-headline">
            <span className={`difficulty ${difficultyClass[difficulty ?? ""]}`}>{difficulty}</span>
            <span className="chart-type-badge">{chartTypeLabel}</span>
          </span>
          <span className="chart-spec-grid">
            <span className="chart-spec">
              <small>等级</small>
              <b>Lv {entry.chart.level}</b>
            </span>
            <span className="chart-spec">
              <small>定数</small>
              <b>{typeof entry.chart.constant === "number" ? entry.chart.constant.toFixed(1) : "缺失"}</b>
            </span>
            <span className="chart-spec designer-spec">
              <small>谱师</small>
              <b>{showDesigner ? designer : "-"}</b>
            </span>
          </span>
        </span>
      ) : (
        <span className="song-stats">{showBpm ? `BPM ${entry.bpm}` : `${entry.category} · ${entry.version}`}</span>
      )}

      {entry.previewAudio && !audioFailed ? (
        <span className={`audio-preview ${audioPlaying ? "is-playing" : ""}`} onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={toggleAudioPreview} aria-label={`${audioPlaying ? "暂停" : "播放"} ${entry.title} 试听`}>
            {audioPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{audioPlaying ? "暂停试听" : "试听 30s"}</span>
          </button>
          <audio
            ref={audioRef}
            className="audio-element"
            preload="none"
            src={entry.previewAudio}
            onPause={() => setAudioPlaying(false)}
            onEnded={() => setAudioPlaying(false)}
            onError={() => {
              setAudioFailed(true);
              setAudioPlaying(false);
            }}
          />
        </span>
      ) : entry.previewAudio && audioFailed ? (
        <span className="audio-preview is-unavailable">
          <Volume2 size={14} />
          本地试听未部署
        </span>
      ) : null}
    </article>
  );
}

function useFallbackJacket(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (!image.src.endsWith("/assets/jacket-fallback.svg")) {
    image.src = "/assets/jacket-fallback.svg";
  }
}

function getChartTypeLabel(type: string | undefined, songId: string) {
  if (type === "standard") {
    return "SD谱";
  }
  if (type === "dx") {
    return "DX谱";
  }
  if (/^jp-00\d+/.test(songId)) {
    return "SD谱";
  }
  return "DX谱";
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
