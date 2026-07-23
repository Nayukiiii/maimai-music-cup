import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  ListMusic,
  Play,
  RotateCcw,
  Save,
  Search,
  SkipForward,
  Trash2,
  Upload,
  WandSparkles
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { songs } from "../data/songs";
import { parseYouTube, YouTubeSource, youtubeEmbedUrl, youtubeSources } from "../data/youtube";
import type { Song } from "../types";

const DRAFT_KEY = "mmc-yt-draft";
const API_KEY_SESSION = "mmc-youtube-api-key-session";
const CANDIDATE_KEY = "mmc-youtube-candidates-v1";
const SKIPPED_KEY = "mmc-youtube-review-skipped";
type Draft = Record<string, YouTubeSource>;
type FilterMode = "all" | "mapped" | "unmapped" | "ready" | "noCandidate" | "skipped";
type ReviewSort = "confidence" | "needsReview" | "library";
type Notice = { tone: "info" | "success" | "error"; message: string } | null;
type MatchCandidate = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  score: number;
};
type CandidateMap = Record<string, MatchCandidate[]>;
type CandidateBundle = {
  version: 1;
  generatedAt?: string;
  songCount?: number;
  candidates: Record<string, Array<Omit<MatchCandidate, "score"> & { score?: number }>>;
};

function loadDraft(): Draft {
  try {
    const cached = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") as Draft;
    return { ...youtubeSources, ...cached };
  } catch {
    return { ...youtubeSources };
  }
}

function loadCandidates(): CandidateMap {
  try {
    return JSON.parse(localStorage.getItem(CANDIDATE_KEY) || "{}") as CandidateMap;
  } catch {
    return {};
  }
}

function loadSkipped(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(SKIPPED_KEY) || "{}") as Record<string, true>;
  } catch {
    return {};
  }
}

export default function AdminApp() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem(API_KEY_SESSION) || "");
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("unmapped");
  const [reviewSort, setReviewSort] = useState<ReviewSort>("confidence");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [activeSongId, setActiveSongId] = useState(songs[0]?.id || "");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<CandidateMap>(loadCandidates);
  const [skippedSongs, setSkippedSongs] = useState<Record<string, true>>(loadSkipped);
  const [previewSource, setPreviewSource] = useState<YouTubeSource | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, Notice>>({});
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [notice, setNotice] = useState<Notice>({ tone: "info", message: "先从左侧选择歌曲，在右侧完成匹配；保存后可自动进入下一首未映射歌曲。" });

  const queryFiltered = useMemo(() => {
    const q = normalize(query);
    return songs.filter((song) => !q || normalize(`${song.title} ${song.artist} ${song.id}`).includes(q));
  }, [query]);

  const filtered = useMemo(() => {
      const items = queryFiltered.filter((song) => {
        const mapped = Boolean(draft[song.id]);
        const hasCandidates = Boolean(candidates[song.id]?.length);
        const scanned = hasOwn(candidates, song.id);
        const skipped = Boolean(skippedSongs[song.id]);
        if (filterMode === "mapped") return mapped;
        if (filterMode === "unmapped") return !mapped;
        if (filterMode === "ready") return !mapped && hasCandidates && !skipped;
        if (filterMode === "noCandidate") return !mapped && scanned && !hasCandidates;
        if (filterMode === "skipped") return !mapped && skipped;
        return true;
      });
      if (filterMode !== "ready" || reviewSort === "library") return items;
      return [...items].sort((a, b) => {
        const scoreA = candidates[a.id]?.[0]?.score ?? -Infinity;
        const scoreB = candidates[b.id]?.[0]?.score ?? -Infinity;
        return reviewSort === "confidence" ? scoreB - scoreA : scoreA - scoreB;
      });
    }, [queryFiltered, filterMode, reviewSort, draft, candidates, skippedSongs]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const activeSong = songs.find((song) => song.id === activeSongId) ?? pageItems[0] ?? songs[0];
  const activeSource = activeSong ? draft[activeSong.id] : undefined;
  const candidateSource = activeSong ? parseYouTube(inputs[activeSong.id] ?? (activeSource ? sourceToUrl(activeSource) : "")) : null;
  const activeSearchQuery = activeSong ? searchQueries[activeSong.id] ?? buildSearchQuery(activeSong) : "";
  const activeCandidates = activeSong ? candidates[activeSong.id] ?? [] : [];
  const mappedCount = songs.filter((song) => draft[song.id]).length;
  const shippedCount = songs.filter((song) => youtubeSources[song.id]).length;
  const changedCount = songs.filter((song) => JSON.stringify(draft[song.id]) !== JSON.stringify(youtubeSources[song.id])).length;
  const unmappedCount = songs.length - mappedCount;
  const scannedCount = songs.filter((song) => hasOwn(candidates, song.id)).length;
  const readyCount = songs.filter((song) => !draft[song.id] && candidates[song.id]?.length && !skippedSongs[song.id]).length;
  const noCandidateCount = songs.filter((song) => !draft[song.id] && hasOwn(candidates, song.id) && !candidates[song.id]?.length).length;
  const skippedCount = songs.filter((song) => !draft[song.id] && skippedSongs[song.id]).length;

  useEffect(() => {
    setPage(0);
  }, [query, filterMode, pageSize]);

  useEffect(() => {
    if (!pageItems.length) return;
    if (!pageItems.some((song) => song.id === activeSongId)) selectSong(pageItems[0]);
  }, [safePage, filterMode, query, pageSize]);

  useEffect(() => {
    function handleReviewKeys(event: KeyboardEvent) {
      if (!activeSong || activeSource || !activeCandidates.length || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, a") || target?.isContentEditable) return;

      const candidateIndex = Number(event.key) - 1;
      if (candidateIndex >= 0 && candidateIndex < 6 && activeCandidates[candidateIndex]) {
        event.preventDefault();
        chooseCandidate(activeSong, activeCandidates[candidateIndex]);
      } else if (event.key === " " && candidateSource) {
        event.preventDefault();
        setPreviewSource(previewSource?.videoId === candidateSource.videoId ? null : candidateSource);
      } else if (event.key === "Enter" && candidateSource) {
        event.preventDefault();
        saveSource(activeSong.id, candidateSource, true);
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        skipReviewSong(activeSong.id);
      }
    }

    window.addEventListener("keydown", handleReviewKeys);
    return () => window.removeEventListener("keydown", handleReviewKeys);
  }, [activeSong, activeCandidates, candidateSource, previewSource, draft, skippedSongs, queryFiltered, filterMode]);

  function persist(next: Draft, message?: string) {
    try {
      setDraft(next);
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      if (message) setNotice({ tone: "success", message });
    } catch {
      setNotice({ tone: "error", message: "浏览器草稿保存失败，请立即导出 JSON 备份。" });
    }
  }

  function updateCandidateMap(updater: (current: CandidateMap) => CandidateMap) {
    setCandidates((current) => {
      const next = updater(current);
      try {
        localStorage.setItem(CANDIDATE_KEY, JSON.stringify(next));
      } catch {
        setNotice({ tone: "error", message: "候选包超过浏览器存储上限，请缩小生成批次后重新导入。" });
      }
      return next;
    });
  }

  function updateSkippedSongs(next: Record<string, true>) {
    setSkippedSongs(next);
    localStorage.setItem(SKIPPED_KEY, JSON.stringify(next));
  }

  function selectSong(song: Song) {
    setActiveSongId(song.id);
    setPreviewSource(null);
    if (!inputs[song.id] && draft[song.id]) {
      setInputs((current) => ({ ...current, [song.id]: sourceToUrl(draft[song.id]) }));
    }
  }

  function saveApiKey(next: string) {
    setApiKey(next);
    if (next.trim()) sessionStorage.setItem(API_KEY_SESSION, next.trim());
    else sessionStorage.removeItem(API_KEY_SESSION);
  }

  function updateSearchQuery(songId: string, value: string) {
    setSearchQueries((current) => ({ ...current, [songId]: value }));
  }

  function assign(songId: string, advance = false) {
    const parsed = parseYouTube(inputs[songId] || "");
    if (!parsed) {
      setRowStatus((current) => ({ ...current, [songId]: { tone: "error", message: "链接格式无效，请粘贴 YouTube URL 或 11 位视频 ID。" } }));
      return;
    }

    saveSource(songId, parsed, advance);
  }

  function saveSource(songId: string, source: YouTubeSource, advance = false) {
    const nextDraft = { ...draft, [songId]: source };
    const duplicate = songs.find((song) => song.id !== songId && draft[song.id]?.videoId === source.videoId);
    persist(nextDraft, advance ? "保存成功，已进入下一首未映射歌曲。" : "已保存到本地草稿。");
    setRowStatus((current) => ({
      ...current,
      [songId]: duplicate
        ? { tone: "info", message: `已保存，但这个视频也用于“${duplicate.title}”，请确认是否为同一音源。` }
        : { tone: "success", message: "保存成功，可试听确认。" }
    }));

    if (skippedSongs[songId]) {
      const nextSkipped = { ...skippedSongs };
      delete nextSkipped[songId];
      updateSkippedSongs(nextSkipped);
    }

    if (advance) {
      if (filterMode === "ready") goNextCandidate(songId, nextDraft);
      else goNextUnmapped(songId, nextDraft);
    }
    else setPreviewSource(source);
  }

  function remove(songId: string) {
    const next = { ...draft };
    delete next[songId];
    persist(next, "映射已从草稿移除。");
    setInputs((current) => ({ ...current, [songId]: "" }));
    setPreviewSource(null);
  }

  function goNextUnmapped(fromId = activeSongId, sourceMap = draft) {
    const scope = query.trim() ? queryFiltered : songs;
    if (!scope.length) {
      setNotice({ tone: "error", message: "当前搜索没有歌曲，无法定位下一首未匹配项。" });
      return;
    }
    const start = Math.max(0, scope.findIndex((song) => song.id === fromId));
    const ordered = [...scope.slice(start + 1), ...scope.slice(0, start + 1)];
    const next = ordered.find((song) => !sourceMap[song.id]);
    if (!next) {
      setNotice({ tone: "success", message: query ? "当前搜索范围已全部完成映射。" : "全部歌曲都已完成映射。" });
      return;
    }
    setFilterMode("unmapped");
    setActiveSongId(next.id);
    setPreviewSource(null);
    const nextVisible = queryFiltered.filter((song) => !sourceMap[song.id]);
    const nextIndex = nextVisible.findIndex((song) => song.id === next.id);
    if (nextIndex >= 0) setPage(Math.floor(nextIndex / pageSize));
  }

  function goNextCandidate(fromId = activeSongId, sourceMap = draft, skippedMap = skippedSongs) {
    const scope = query.trim() ? queryFiltered : songs;
    const start = Math.max(0, scope.findIndex((song) => song.id === fromId));
    const ordered = [...scope.slice(start + 1), ...scope.slice(0, start + 1)];
    const next = ordered.find((song) => !sourceMap[song.id] && candidates[song.id]?.length && !skippedMap[song.id]);
    if (!next) {
      setNotice({ tone: "success", message: query ? "当前搜索范围的候选已审核完成。" : "候选包已经审核完成；请处理“无候选”和“已跳过”队列。" });
      return;
    }
    setFilterMode("ready");
    setActiveSongId(next.id);
    setPreviewSource(null);
    const visible = scope.filter((song) => !sourceMap[song.id] && candidates[song.id]?.length && !skippedMap[song.id]);
    const nextIndex = visible.findIndex((song) => song.id === next.id);
    if (nextIndex >= 0) setPage(Math.floor(nextIndex / pageSize));
  }

  function skipReviewSong(songId: string) {
    const nextSkipped = { ...skippedSongs, [songId]: true as const };
    updateSkippedSongs(nextSkipped);
    setPreviewSource(null);
    setNotice({ tone: "info", message: "已暂时跳过；之后可在“已跳过”队列集中处理。" });
    goNextCandidate(songId, draft, nextSkipped);
  }

  async function autoMatch(song: Song) {
    const searchQuery = searchQueries[song.id]?.trim() || buildSearchQuery(song);
    if (!apiKey.trim()) {
      window.open(youtubeSearchUrl(song, searchQuery), "_blank", "noopener,noreferrer");
      setRowStatus((current) => ({ ...current, [song.id]: { tone: "info", message: "未设置 API Key，已用当前关键词打开 YouTube 搜索。复制目标链接回来即可。" } }));
      return;
    }

    setMatchingId(song.id);
    setRowStatus((current) => ({ ...current, [song.id]: { tone: "info", message: "正在搜索并计算候选匹配度…" } }));
    try {
      const params = new URLSearchParams({ part: "snippet", type: "video", maxResults: "8", q: searchQuery, key: apiKey.trim() });
      const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
      if (!response.ok) throw new Error(`YouTube API 返回 ${response.status}`);
      const data = (await response.json()) as {
        items?: Array<{
          id?: { videoId?: string };
          snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } };
        }>;
      };
      const results = (data.items ?? [])
        .flatMap((item): MatchCandidate[] => {
          const videoId = item.id?.videoId;
          if (!videoId) return [];
          const candidate = {
            videoId,
            title: decodeEntities(item.snippet?.title || videoId),
            channelTitle: decodeEntities(item.snippet?.channelTitle || "未知频道"),
            thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            score: 0
          };
          return [{ ...candidate, score: scoreCandidate(song, candidate) }];
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      if (!results.length) throw new Error("没有找到候选视频");

      updateCandidateMap((current) => ({ ...current, [song.id]: results }));
      setRowStatus((current) => ({
        ...current,
        [song.id]: {
          tone: "success",
          message: `找到 ${results.length} 个候选，已按曲名、歌手、官方音源特征排序。请试听后确认。`
        }
      }));
    } catch (error) {
      setRowStatus((current) => ({
        ...current,
        [song.id]: { tone: "error", message: error instanceof Error ? `匹配失败：${error.message}` : "匹配失败，请手动搜索。" }
      }));
    } finally {
      setMatchingId(null);
    }
  }

  function chooseCandidate(song: Song, candidate: MatchCandidate, advance = false) {
    const source = { videoId: candidate.videoId };
    setInputs((current) => ({ ...current, [song.id]: sourceToUrl(source) }));
    setPreviewSource(source);
    setRowStatus((current) => ({
      ...current,
      [song.id]: { tone: "success", message: `已选择“${candidate.title}”${advance ? "并保存" : "，试听无误后即可保存"}。` }
    }));
    if (advance) saveSource(song.id, source, true);
  }

  function exportJson() {
    const ordered = Object.fromEntries(Object.entries(draft).sort(([a], [b]) => a.localeCompare(b)));
    const blob = new Blob([`${JSON.stringify(ordered, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "youtubeSources.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice({ tone: "success", message: `已导出 ${mappedCount} 条映射。请覆盖 src/data/youtubeSources.json 后重新构建。` });
  }

  async function importCandidateBundle(file: File) {
    setNotice({ tone: "info", message: "正在读取候选包并计算匹配度…" });
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isCandidateBundle(parsed)) throw new Error("文件不是有效的 youtubeCandidates.json 候选包");
      const songById = new Map(songs.map((song) => [song.id, song]));
      let imported = 0;
      let withResults = 0;
      const next: CandidateMap = { ...candidates };

      Object.entries(parsed.candidates).forEach(([songId, entries]) => {
        const song = songById.get(songId);
        if (!song) return;
        next[songId] = entries
          .filter((entry) => /^[a-zA-Z0-9_-]{11}$/.test(entry.videoId))
          .slice(0, 6)
          .map((entry) => ({
            videoId: entry.videoId,
            title: entry.title || entry.videoId,
            channelTitle: entry.channelTitle || "未知频道",
            thumbnail: entry.thumbnail || `https://i.ytimg.com/vi/${entry.videoId}/mqdefault.jpg`,
            score: scoreCandidate(song, entry)
          }))
          .sort((a, b) => b.score - a.score);
        imported += 1;
        if (next[songId].length) withResults += 1;
      });

      updateCandidateMap(() => next);
      setFilterMode("ready");
      setPage(0);
      const first = songs.find((song) => !draft[song.id] && next[song.id]?.length && !skippedSongs[song.id]);
      if (first) selectSong(first);
      setNotice({ tone: "success", message: `候选包已导入：扫描 ${imported} 首，其中 ${withResults} 首有可审核候选。可直接使用键盘连续确认。` });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? `候选包导入失败：${error.message}` : "候选包导入失败" });
    }
  }

  function clearCandidateBundle() {
    updateCandidateMap(() => ({}));
    updateSkippedSongs({});
    setFilterMode("unmapped");
    setPreviewSource(null);
    setNotice({ tone: "info", message: "浏览器中的候选包和跳过记录已清除，已保存的音源映射不会受影响。" });
  }

  async function importJson(file: File) {
    setNotice({ tone: "info", message: "正在读取并校验 JSON…" });
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isSourceMap(parsed)) throw new Error("文件不是有效的 YouTube 映射对象");
      persist({ ...draft, ...parsed }, `导入成功：合并 ${Object.keys(parsed).length} 条映射。`);
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? `导入失败：${error.message}` : "导入失败" });
    }
  }

  function importBulkText() {
    const next = { ...draft };
    const failures: string[] = [];
    let imported = 0;

    bulkText.split(/\r?\n/).forEach((line, index) => {
      const columns = line.split("\t").map((value) => value.trim()).filter(Boolean);
      if (!columns.length) return;
      const url = columns[columns.length - 1] || "";
      const source = parseYouTube(url);
      const titleArtistMatches = columns.length === 3
        ? songs.filter((item) => normalize(item.title) === normalize(columns[0]) && normalize(item.artist) === normalize(columns[1]))
        : [];
      const song = columns.length === 2
        ? songs.find((item) => item.id === columns[0])
        : titleArtistMatches.length === 1 ? titleArtistMatches[0] : undefined;
      if (!source || !song) {
        failures.push(String(index + 1));
        return;
      }
      next[song.id] = source;
      imported += 1;
    });

    if (!imported) {
      setNotice({ tone: "error", message: "没有识别到有效映射。请检查制表符分隔格式和 YouTube 链接。" });
      return;
    }
    persist(next, `批量导入 ${imported} 条映射${failures.length ? `；第 ${failures.join("、")} 行未识别` : ""}。`);
    setBulkText("");
  }

  function resetDraft() {
    persist({ ...youtubeSources }, "草稿已恢复为当前构建版本。");
    setInputs({});
    setPreviewSource(null);
  }

  return (
    <main className="admin-shell admin-workbench-shell">
      <header className="admin-bar">
        <div>
          <p className="eyebrow">MAIMAI CUP · ADMIN</p>
          <h1 className="admin-title">音源匹配工作台</h1>
          <p className="admin-subtitle">先导入离线候选包，再用键盘连续审核；一千首曲库也不需要逐首手动搜索。</p>
        </div>
        <a className="ghost-action admin-back" href="/">返回赛事</a>
      </header>

      <section className="admin-overview" aria-label="映射概览">
        <div><span>已完成</span><strong>{mappedCount}</strong><small>/ {songs.length}</small></div>
        <div><span>剩余未匹配</span><strong>{unmappedCount}</strong><small>首</small></div>
        <div className={readyCount ? "candidate-ready" : ""}><span>候选待审核</span><strong>{readyCount}</strong><small>/ 已扫描 {scannedCount}</small></div>
        <div className={changedCount ? "changed" : ""}><span>待导出变更</span><strong>{changedCount}</strong><small>首</small></div>
      </section>

      <section className="admin-console">
        <div className="admin-toolbar">
          <label className="admin-search"><Search size={17} /><input aria-label="搜索歌曲" placeholder="搜索曲名 / 歌手 / ID" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <select aria-label="映射状态" value={filterMode} onChange={(event) => setFilterMode(event.target.value as FilterMode)}>
            <option value="unmapped">仅未匹配 · {unmappedCount}</option>
            <option value="ready">候选待审核 · {readyCount}</option>
            <option value="noCandidate">无候选 · {noCandidateCount}</option>
            <option value="skipped">已跳过 · {skippedCount}</option>
            <option value="mapped">仅已匹配 · {mappedCount}</option>
            <option value="all">全部歌曲 · {songs.length}</option>
          </select>
          <button className="ghost-action" onClick={() => goNextUnmapped()}><SkipForward size={16} />下一首未匹配</button>
          {readyCount ? <button className="ghost-action" onClick={() => goNextCandidate()}><WandSparkles size={16} />下一首候选</button> : null}
          <label className="primary-inline admin-import"><Upload size={16} />导入候选包<input type="file" accept="application/json" hidden onChange={(event) => event.target.files?.[0] && importCandidateBundle(event.target.files[0])} /></label>
          <button className="primary-inline" onClick={exportJson}><Download size={16} />导出 JSON</button>
          <label className="ghost-action admin-import"><Upload size={16} />导入 JSON<input type="file" accept="application/json" hidden onChange={(event) => event.target.files?.[0] && importJson(event.target.files[0])} /></label>
          {scannedCount ? <button className="ghost-action danger-action" onClick={clearCandidateBundle}><Trash2 size={16} />清除候选包</button> : null}
          <button className="ghost-action danger-action" onClick={resetDraft} disabled={!changedCount}><RotateCcw size={16} />放弃草稿</button>
        </div>
        {notice ? <NoticeBar notice={notice} /> : null}
      </section>

      <div className="admin-workbench">
        <section className="admin-queue-panel">
          <div className="admin-queue-head">
            <div><ListMusic size={18} /><b>歌曲队列</b><span>{filtered.length} 首</span></div>
            <div className="admin-queue-controls">
              {filterMode === "ready" ? (
                <select aria-label="候选排序" value={reviewSort} onChange={(event) => setReviewSort(event.target.value as ReviewSort)}>
                  <option value="confidence">推荐优先</option>
                  <option value="needsReview">需核对优先</option>
                  <option value="library">曲库顺序</option>
                </select>
              ) : null}
              <select aria-label="每页数量" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                <option value="25">25 / 页</option><option value="50">50 / 页</option><option value="100">100 / 页</option>
              </select>
            </div>
          </div>

          <div className="admin-song-list">
            {pageItems.map((song, index) => {
              const mapped = Boolean(draft[song.id]);
              const ready = !mapped && Boolean(candidates[song.id]?.length) && !skippedSongs[song.id];
              const skipped = !mapped && Boolean(skippedSongs[song.id]);
              return (
                <button className={`admin-song-row ${song.id === activeSong?.id ? "active" : ""}`} onClick={() => selectSong(song)} key={song.id}>
                  <span className="admin-song-number">{safePage * pageSize + index + 1}</span>
                  <img src={song.jacket} alt="" loading="lazy" />
                  <span className="admin-song-copy"><b>{song.title}</b><small>{song.artist}</small></span>
                  <span className={`mapping-dot ${mapped ? "mapped" : ready ? "ready" : skipped ? "skipped" : ""}`} title={mapped ? "已匹配" : ready ? "候选待审核" : skipped ? "已跳过" : "未匹配"} />
                </button>
              );
            })}
            {!pageItems.length ? <div className="admin-empty"><Search size={24} /><b>没有匹配结果</b><span>换个关键词或状态筛选试试。</span></div> : null}
          </div>

          <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
        </section>

        <section className="admin-editor-panel">
          {activeSong ? (
            <>
              <div className="admin-editor-song">
                <img src={activeSong.jacket} alt="" />
                <div><span>当前歌曲</span><h2>{activeSong.title}</h2><p>{activeSong.artist}</p><small>{activeSong.category} · {activeSong.version} · ID {activeSong.id}</small></div>
                <span className={`editor-map-state ${activeSource ? "mapped" : ""}`}>{activeSource ? "已匹配" : "未匹配"}</span>
              </div>

              <section className="admin-match-studio" aria-label="YouTube 候选匹配">
                <div className="admin-match-heading">
                  <div><span>STEP 1</span><b>搜索并比较候选音源</b></div>
                  <small>每次最多返回 6 条，按匹配度排序</small>
                </div>

                <div className="admin-match-query">
                  <label htmlFor="admin-youtube-query">搜索关键词</label>
                  <div>
                    <input
                      id="admin-youtube-query"
                      value={activeSearchQuery}
                      onChange={(event) => updateSearchQuery(activeSong.id, event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && autoMatch(activeSong)}
                    />
                    <button className="primary-inline" onClick={() => autoMatch(activeSong)} disabled={matchingId === activeSong.id || !activeSearchQuery.trim()}>
                      <WandSparkles size={16} />{matchingId === activeSong.id ? "搜索中…" : apiKey.trim() ? "搜索候选" : "去 YouTube 搜索"}
                    </button>
                  </div>
                </div>

                <div className="admin-query-presets" aria-label="搜索词模板">
                  <span>快速改词</span>
                  {searchPresets(activeSong).map((preset) => (
                    <button type="button" key={preset.label} onClick={() => updateSearchQuery(activeSong.id, preset.query)}>
                      {preset.label}
                    </button>
                  ))}
                  <a href={youtubeSearchUrl(activeSong, activeSearchQuery)} target="_blank" rel="noreferrer"><ExternalLink size={13} />浏览器搜索</a>
                </div>

                {activeCandidates.length ? (
                  <div className="admin-candidate-section">
                    <div className="admin-candidate-summary">
                      <b>{activeCandidates.length} 个候选 · 待审核 {readyCount} 首</b>
                      <span>“推荐”只代表文字匹配度，保存前仍建议试听。</span>
                    </div>
                    <div className="admin-review-hotkeys" aria-label="键盘审核快捷键">
                      <span><kbd>1–6</kbd> 选候选</span>
                      <span><kbd>Space</kbd> 试听</span>
                      <span><kbd>Enter</kbd> 确认下一首</span>
                      <button onClick={() => skipReviewSong(activeSong.id)}><kbd>S</kbd> 暂时跳过</button>
                    </div>
                    <div className="admin-candidate-list">
                      {activeCandidates.map((candidate, index) => {
                        const selected = candidateSource?.videoId === candidate.videoId;
                        const playing = previewSource?.videoId === candidate.videoId;
                        const duplicate = songs.find((song) => song.id !== activeSong.id && draft[song.id]?.videoId === candidate.videoId);
                        return (
                          <article className={`admin-candidate ${selected ? "selected" : ""}`} key={candidate.videoId}>
                            <div className="admin-candidate-rank"><kbd>{index + 1}</kbd></div>
                            <img src={candidate.thumbnail} alt="" loading="lazy" />
                            <div className="admin-candidate-copy">
                              <div>
                                <span className={`candidate-confidence ${confidenceClass(candidate.score)}`}>{confidenceLabel(candidate.score)}</span>
                                {selected ? <span className="candidate-selected"><CheckCircle2 size={12} />已选用</span> : null}
                                {duplicate ? <span className="candidate-duplicate" title={`该视频已映射给 ${duplicate.title}`}>重复源 · {duplicate.title}</span> : null}
                              </div>
                              <b title={candidate.title}>{candidate.title}</b>
                              <small>{candidate.channelTitle}</small>
                            </div>
                            <div className="admin-candidate-actions">
                              <button className="ghost-action" onClick={() => setPreviewSource(playing ? null : { videoId: candidate.videoId })}><Play size={14} />{playing ? "收起" : "试听"}</button>
                              <button className="ghost-action" onClick={() => chooseCandidate(activeSong, candidate)}>选用</button>
                              <button className="primary-inline" onClick={() => chooseCandidate(activeSong, candidate, true)}>确认并下一首</button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="admin-candidate-empty">
                    <WandSparkles size={18} />
                    <span>{apiKey.trim() ? "搜索后会在这里列出多个候选，不再直接采用第一条结果。" : "填写下方 API Key 可在页面内比较候选；不填写则打开 YouTube 搜索。"}</span>
                  </div>
                )}
              </section>

              {previewSource ? (
                <div className="admin-preview-panel">
                  <div><span>正在试听</span><code>{previewSource.videoId}</code><button onClick={() => setPreviewSource(null)}>关闭播放器</button></div>
                  <div className="yt-frame admin-frame">
                    <iframe
                      src={youtubeEmbedUrl(previewSource)}
                      title={`${activeSong.title} 候选试听`}
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                      onLoad={() => setRowStatus((items) => ({ ...items, [activeSong.id]: { tone: "success", message: "播放器已载入，请核对曲名、歌手和音源内容。" } }))}
                      onError={() => setRowStatus((items) => ({ ...items, [activeSong.id]: { tone: "error", message: "播放器载入失败，请检查视频是否允许嵌入。" } }))}
                    />
                  </div>
                </div>
              ) : null}

              <div className="admin-manual-divider"><span>STEP 2 · 确认链接</span><small>也可以直接粘贴手动找到的 URL</small></div>

              <label className="admin-url-field">
                YouTube URL 或 11 位视频 ID
                <input
                  autoFocus
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={inputs[activeSong.id] ?? (activeSource ? sourceToUrl(activeSource) : "")}
                  onChange={(event) => setInputs((items) => ({ ...items, [activeSong.id]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) assign(activeSong.id, true);
                    else if (event.key === "Enter") assign(activeSong.id);
                  }}
                />
              </label>

              <div className="admin-editor-actions">
                <button className="primary-inline" onClick={() => assign(activeSong.id)}><Save size={16} />保存并试听</button>
                <button className="primary-inline save-next" onClick={() => assign(activeSong.id, true)}><SkipForward size={16} />保存并下一首</button>
                {candidateSource ? <button className="ghost-action" onClick={() => setPreviewSource(previewSource?.videoId === candidateSource.videoId ? null : candidateSource)}><Play size={16} />{previewSource?.videoId === candidateSource.videoId ? "收起试听" : "试听链接"}</button> : null}
              </div>

              <p className="admin-shortcuts">Enter 保存并试听 · Ctrl / ⌘ + Enter 保存并进入下一首</p>
              {rowStatus[activeSong.id] ? <NoticeBar notice={rowStatus[activeSong.id]!} /> : null}

              {activeSource ? (
                <div className="admin-current-source">
                  <div><span>当前映射</span><code>{activeSource.videoId}{activeSource.start ? ` · ${activeSource.start}s` : ""}</code></div>
                  <button className="ghost-action" onClick={() => setPreviewSource(previewSource?.videoId === activeSource.videoId ? null : activeSource)}><Play size={15} />{previewSource?.videoId === activeSource.videoId ? "收起试听" : "试听当前源"}</button>
                  <button className="ghost-action danger-action" onClick={() => remove(activeSong.id)}><Trash2 size={15} />删除映射</button>
                </div>
              ) : null}

              <details className="admin-api-panel">
                <summary><WandSparkles size={16} />自动匹配设置（可选）</summary>
                <label>YouTube Data API Key 仅保存在当前标签页。每次搜索会消耗 YouTube Search API 配额，因此不会自动批量跑完整曲库。<input type="password" autoComplete="off" placeholder="不填写时直接打开 YouTube 搜索" value={apiKey} onChange={(event) => saveApiKey(event.target.value)} /></label>
              </details>

              <details className="admin-bulk-panel">
                <summary><Upload size={16} />批量粘贴映射</summary>
                <p>每行使用制表符分隔：<code>songId [Tab] URL</code>，或 <code>曲名 [Tab] 歌手 [Tab] URL</code>。</p>
                <textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={"song-id\thttps://youtu.be/xxxxxxxxxxx\n曲名\t歌手\thttps://youtu.be/xxxxxxxxxxx"} />
                <button className="ghost-action" disabled={!bulkText.trim()} onClick={importBulkText}>校验并导入</button>
              </details>
            </>
          ) : <div className="admin-empty"><ListMusic size={24} /><b>请选择一首歌曲</b></div>}
        </section>
      </div>

      <footer className="admin-build-note">当前构建版本 {shippedCount} 条映射 · 草稿自动保存在本浏览器 · 导出后覆盖 src/data/youtubeSources.json 并重新部署</footer>
    </main>
  );
}

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  return (
    <div className="admin-pagination">
      <button onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0}><ChevronLeft size={16} />上一页</button>
      <span>第 <b>{page + 1}</b> / {pageCount} 页</span>
      <button onClick={() => onChange(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1}>下一页<ChevronRight size={16} /></button>
    </div>
  );
}

function NoticeBar({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <div className={`admin-notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      {notice.tone === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
      <span>{notice.message}</span>
    </div>
  );
}

function isSourceMap(value: unknown): value is Draft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(
    (source) => Boolean(source) && typeof source === "object" && /^[a-zA-Z0-9_-]{11}$/.test(String((source as YouTubeSource).videoId || ""))
  );
}

function isCandidateBundle(value: unknown): value is CandidateBundle {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const bundle = value as Partial<CandidateBundle>;
  if (bundle.version !== 1 || !bundle.candidates || typeof bundle.candidates !== "object" || Array.isArray(bundle.candidates)) return false;
  return Object.values(bundle.candidates).every(
    (entries) => Array.isArray(entries) && entries.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Partial<MatchCandidate>;
      return /^[a-zA-Z0-9_-]{11}$/.test(candidate.videoId || "") && typeof candidate.title === "string";
    })
  );
}

function hasOwn(value: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function sourceToUrl(source: YouTubeSource) {
  return `https://www.youtube.com/watch?v=${source.videoId}${source.start ? `&t=${source.start}` : ""}`;
}

function buildSearchQuery(song: Song) {
  return `${song.title} ${song.artist} maimai`;
}

function searchPresets(song: Song) {
  return [
    { label: "曲名 + 歌手", query: `${song.title} ${song.artist}` },
    { label: "maimai 音源", query: `${song.title} ${song.artist} maimai` },
    { label: "官方 / Topic", query: `${song.title} ${song.artist} official topic` }
  ];
}

function youtubeSearchUrl(song: Song, query = buildSearchQuery(song)) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim() || buildSearchQuery(song))}`;
}

function scoreCandidate(song: Song, candidate: Pick<MatchCandidate, "title" | "channelTitle">) {
  const title = normalizeForMatch(candidate.title);
  const channel = normalizeForMatch(candidate.channelTitle);
  const songTitle = normalizeForMatch(song.title);
  const artist = normalizeForMatch(song.artist);
  let score = 0;

  if (songTitle && title.includes(songTitle)) score += 52;
  else score += overlapScore(songTitle, title, 34);

  if (artist && `${title} ${channel}`.includes(artist)) score += 28;
  else score += overlapScore(artist, `${title} ${channel}`, 18);

  if (/maimai|舞萌|でらっくす/.test(title)) score += 10;
  if (/official|topic|sega|maimai/.test(`${title} ${channel}`)) score += 8;
  if (/音源|original|soundtrack|ost/.test(title)) score += 5;
  if (/譜面|gameplay|手元|ap\+?|full combo|創作|chart|外部出力/.test(title)) score -= 14;
  if (/shorts|切り抜き|reaction|解説|実況/.test(title)) score -= 12;
  return score;
}

function overlapScore(expected: string, candidate: string, max: number) {
  const tokens = expected.split(" ").filter((token) => token.length > 1);
  if (!tokens.length) return 0;
  const matches = tokens.filter((token) => candidate.includes(token)).length;
  return Math.round((matches / tokens.length) * max);
}

function normalizeForMatch(value: string) {
  return normalize(value)
    .normalize("NFKC")
    .replace(/[\s\-_~～・:：/／()[\]【】「」『』'"“”]+/g, " ")
    .trim();
}

function confidenceLabel(score: number) {
  if (score >= 78) return "高度匹配";
  if (score >= 52) return "较匹配";
  return "需核对";
}

function confidenceClass(score: number) {
  if (score >= 78) return "high";
  if (score >= 52) return "medium";
  return "low";
}

function decodeEntities(value: string) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}
