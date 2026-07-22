import { useMemo, useState } from "react";
import { songs } from "../data/songs";
import { parseYouTube, YouTubeSource, youtubeEmbedUrl, youtubeSources } from "../data/youtube";
import type { Song } from "../types";

const DRAFT_KEY = "mmc-yt-draft";
const API_KEY_STORAGE = "mmc-youtube-api-key";
type Draft = Record<string, YouTubeSource>;
type MatchStatus = Record<string, string>;

function loadDraft(): Draft {
  try {
    return { ...youtubeSources, ...JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") };
  } catch {
    return { ...youtubeSources };
  }
}

export default function AdminApp() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || "");
  const [query, setQuery] = useState("");
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [matchStatus, setMatchStatus] = useState<MatchStatus>({});
  const [matchingId, setMatchingId] = useState<string | null>(null);

  function persist(next: Draft) {
    setDraft(next);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  }

  function saveApiKey(next: string) {
    setApiKey(next);
    if (next.trim()) {
      localStorage.setItem(API_KEY_STORAGE, next.trim());
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
    }
  }

  function assign(songId: string) {
    const parsed = parseYouTube(inputs[songId] || "");
    if (!parsed) {
      alert("无法识别 YouTube 链接或视频 ID");
      return;
    }
    persist({ ...draft, [songId]: parsed });
    setPreview(songId);
  }

  function remove(songId: string) {
    const next = { ...draft };
    delete next[songId];
    persist(next);
    setPreview((current) => (current === songId ? null : current));
  }

  async function autoMatch(song: Song) {
    const searchQuery = buildSearchQuery(song);
    if (!apiKey.trim()) {
      window.open(youtubeSearchUrl(song), "_blank", "noopener,noreferrer");
      setMatchStatus((items) => ({ ...items, [song.id]: "未填写 API Key，已打开 YouTube 搜索页。" }));
      return;
    }

    setMatchingId(song.id);
    setMatchStatus((items) => ({ ...items, [song.id]: "搜索中..." }));
    try {
      const params = new URLSearchParams({
        part: "snippet",
        type: "video",
        maxResults: "1",
        q: searchQuery,
        key: apiKey.trim()
      });
      const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`YouTube API ${response.status}`);
      }
      const data = (await response.json()) as {
        items?: Array<{
          id?: { videoId?: string };
          snippet?: { title?: string; channelTitle?: string };
        }>;
      };
      const first = data.items?.find((item) => item.id?.videoId);
      if (!first?.id?.videoId) {
        setMatchStatus((items) => ({ ...items, [song.id]: "没有找到候选，试试手动搜索。" }));
        return;
      }

      const source = { videoId: first.id.videoId };
      persist({ ...draft, [song.id]: source });
      setInputs((items) => ({ ...items, [song.id]: `https://www.youtube.com/watch?v=${first.id!.videoId}` }));
      setPreview(song.id);
      scrollToSong(song.id);
      setMatchStatus((items) => ({
        ...items,
        [song.id]: `已匹配：${first.snippet?.title || first.id!.videoId}${first.snippet?.channelTitle ? ` / ${first.snippet.channelTitle}` : ""}`
      }));
    } catch (error) {
      setMatchStatus((items) => ({
        ...items,
        [song.id]: error instanceof Error ? `匹配失败：${error.message}` : "匹配失败"
      }));
    } finally {
      setMatchingId(null);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "youtubeSources.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        persist({ ...draft, ...JSON.parse(String(reader.result)) });
      } catch {
        alert("JSON 解析失败");
      }
    };
    reader.readAsText(file);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return songs.filter((song) => {
      if (onlyUnmapped && draft[song.id]) return false;
      if (!q) return true;
      return song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q);
    });
  }, [query, onlyUnmapped, draft]);

  const displayed = filtered.slice(0, 300);
  const previewable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return songs
      .filter((song) => {
        if (!draft[song.id]) return false;
        if (!q) return true;
        return song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q);
      })
      .slice(0, 300);
  }, [query, draft]);
  const mappedCount = Object.keys(draft).length;

  function previewNext() {
    if (previewable.length === 0) {
      alert("当前没有可预览的音源。先自动匹配或手动保存一首。");
      return;
    }
    const currentIndex = preview ? previewable.findIndex((song) => song.id === preview) : -1;
    const next = previewable[(currentIndex + 1) % previewable.length];
    setOnlyUnmapped(false);
    setPreview(next.id);
    scrollToSong(next.id);
  }

  return (
    <main className="admin-shell">
      <header className="admin-bar">
        <div>
          <p className="eyebrow">ADMIN · YOUTUBE 曲源</p>
          <h1 className="admin-title">音源管理</h1>
        </div>
        <div className="admin-stat">
          已挂 {mappedCount} / {songs.length} 首
        </div>
      </header>

      <div className="admin-toolbar">
        <input placeholder="搜索标题 / 曲师" value={query} onChange={(event) => setQuery(event.target.value)} />
        <input
          className="admin-api-key"
          placeholder="YouTube Data API Key，可选"
          value={apiKey}
          onChange={(event) => saveApiKey(event.target.value)}
        />
        <label className="admin-check">
          <input type="checkbox" checked={onlyUnmapped} onChange={(event) => setOnlyUnmapped(event.target.checked)} />
          只看未挂
        </label>
        <button className="primary-inline" onClick={previewNext}>
          一键预览下一首
        </button>
        <button className="primary-inline" onClick={exportJson}>
          导出 youtubeSources.json
        </button>
        <label className="ghost-action admin-import">
          导入 JSON
          <input
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => event.target.files?.[0] && importJson(event.target.files[0])}
          />
        </label>
      </div>

      <p className="filter-hint">
        自动匹配使用你本浏览器里的 YouTube Data API Key，不会写进仓库；没填 key 时会打开 YouTube 搜索页。改动只存在草稿里，导出后覆盖 <code>src/data/youtubeSources.json</code> 并重建才生效。
      </p>

      <div className="admin-list">
        {displayed.map((song) => {
          const current = draft[song.id];
          return (
            <div className="admin-row" id={adminRowId(song.id)} key={song.id}>
              <img src={song.jacket} alt="" />
              <div className="admin-meta">
                <b>{song.title}</b>
                <span>{song.artist}</span>
                {current ? (
                  <span className="admin-current">
                    videoId: {current.videoId}
                    {current.start ? ` @${current.start}s` : ""}
                  </span>
                ) : null}
              </div>
              <div className="admin-actions">
                <input
                  placeholder="粘贴 YouTube 链接或 ID"
                  value={inputs[song.id] ?? ""}
                  onChange={(event) => setInputs((items) => ({ ...items, [song.id]: event.target.value }))}
                />
                <button className="primary-inline" onClick={() => assign(song.id)}>
                  保存
                </button>
                <button className="ghost-action" onClick={() => autoMatch(song)} disabled={matchingId === song.id}>
                  {matchingId === song.id ? "匹配中" : "自动匹配"}
                </button>
                <button className="ghost-action" onClick={() => window.open(youtubeSearchUrl(song), "_blank", "noopener,noreferrer")}>
                  搜歌
                </button>
                {current ? (
                  <button className="ghost-action" onClick={() => setPreview(preview === song.id ? null : song.id)}>
                    预览
                  </button>
                ) : null}
                {current ? (
                  <button className="ghost-action" onClick={() => remove(song.id)}>
                    删除
                  </button>
                ) : null}
              </div>
              {matchStatus[song.id] ? <div className="admin-match-status">{matchStatus[song.id]}</div> : null}
              {current && preview === song.id ? (
                <div className="yt-frame admin-frame">
                  <iframe src={youtubeEmbedUrl(current)} title={song.title} allow="autoplay; encrypted-media" allowFullScreen />
                </div>
              ) : null}
            </div>
          );
        })}
        {filtered.length > 300 ? <p className="filter-hint">仅显示前 300 条，用搜索缩小范围。</p> : null}
      </div>
    </main>
  );
}

function buildSearchQuery(song: Song) {
  return `${song.title} ${song.artist} maimai`;
}

function youtubeSearchUrl(song: Song) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(buildSearchQuery(song))}`;
}

function scrollToSong(songId: string) {
  window.setTimeout(() => {
    document.getElementById(adminRowId(songId))?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 80);
}

function adminRowId(songId: string) {
  return `admin-song-${encodeURIComponent(songId)}`;
}
