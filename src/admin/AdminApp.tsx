import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileJson,
  Gauge,
  Image as ImageIcon,
  ListChecks,
  Music2,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Volume2,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { songs } from "../data/songs";
import type { Chart, Song } from "../types";

type ReviewValue = "ok" | "issue" | undefined;
type AssetReview = {
  jacket?: ReviewValue;
  audio?: ReviewValue;
  constants?: ReviewValue;
  note?: string;
  updatedAt?: string;
};
type ReviewMap = Record<string, AssetReview>;
type FilterMode = "all" | "pending" | "ok" | "issue" | "noAudio" | "noConstant" | "jacketIssue" | "audioIssue" | "constantIssue";
type RuntimeState = "unknown" | "ok" | "error";

const REVIEW_KEY = "mmc-jp-asset-review-v1";
const PAGE_SIZE = 80;

const difficultyOrder: Record<string, number> = {
  Basic: 0,
  Advanced: 1,
  Expert: 2,
  Master: 3,
  "Re:Master": 4
};

const difficultyClass: Record<string, string> = {
  Basic: "basic",
  Advanced: "advanced",
  Expert: "expert",
  Master: "master",
  "Re:Master": "remaster"
};

function loadReviewMap(): ReviewMap {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_KEY) || "{}") as ReviewMap;
  } catch {
    return {};
  }
}

export default function AdminApp() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("pending");
  const [page, setPage] = useState(0);
  const [activeSongId, setActiveSongId] = useState(songs[0]?.id || "");
  const [reviewMap, setReviewMap] = useState<ReviewMap>(loadReviewMap);
  const [jacketState, setJacketState] = useState<Record<string, RuntimeState>>({});
  const [audioState, setAudioState] = useState<Record<string, RuntimeState>>({});

  const stats = useMemo(() => buildStats(reviewMap, jacketState, audioState), [reviewMap, jacketState, audioState]);

  const filteredSongs = useMemo(() => {
    const q = normalize(query);
    return songs.filter((song) => {
      if (q && !normalize(`${song.id} ${song.title} ${song.artist} ${song.category} ${song.version}`).includes(q)) return false;
      const review = reviewMap[song.id] || {};
      const songOk = isSongConfirmed(review);
      const hasAudio = Boolean(song.previewAudio);
      const hasConstant = song.charts.some((chart) => typeof chart.constant === "number");
      if (filter === "pending") return !songOk;
      if (filter === "ok") return songOk;
      if (filter === "issue") return review.jacket === "issue" || review.audio === "issue" || review.constants === "issue";
      if (filter === "noAudio") return !hasAudio;
      if (filter === "noConstant") return !hasConstant;
      if (filter === "jacketIssue") return review.jacket === "issue" || jacketState[song.id] === "error";
      if (filter === "audioIssue") return review.audio === "issue" || audioState[song.id] === "error";
      if (filter === "constantIssue") return review.constants === "issue";
      return true;
    });
  }, [query, filter, reviewMap, jacketState, audioState]);

  const pageCount = Math.max(1, Math.ceil(filteredSongs.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filteredSongs.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const activeSong = songs.find((song) => song.id === activeSongId) || pageItems[0] || songs[0];
  const activeReview = activeSong ? reviewMap[activeSong.id] || {} : {};

  useEffect(() => {
    setPage(0);
  }, [query, filter]);

  useEffect(() => {
    if (!activeSong || pageItems.some((song) => song.id === activeSong.id)) return;
    if (pageItems[0]) setActiveSongId(pageItems[0].id);
  }, [pageItems, activeSong]);

  function persist(next: ReviewMap) {
    setReviewMap(next);
    localStorage.setItem(REVIEW_KEY, JSON.stringify(next));
  }

  function mark(songId: string, key: "jacket" | "audio" | "constants", value: "ok" | "issue") {
    persist({
      ...reviewMap,
      [songId]: {
        ...reviewMap[songId],
        [key]: value,
        updatedAt: new Date().toISOString()
      }
    });
  }

  function markAllOk(song: Song) {
    persist({
      ...reviewMap,
      [song.id]: {
        ...reviewMap[song.id],
        jacket: "ok",
        audio: song.previewAudio ? "ok" : "issue",
        constants: song.charts.some((chart) => typeof chart.constant === "number") ? "ok" : "issue",
        updatedAt: new Date().toISOString()
      }
    });
  }

  function updateNote(songId: string, note: string) {
    persist({
      ...reviewMap,
      [songId]: {
        ...reviewMap[songId],
        note,
        updatedAt: new Date().toISOString()
      }
    });
  }

  function clearReview(songId: string) {
    const next = { ...reviewMap };
    delete next[songId];
    persist(next);
  }

  function goNextPending(fromId = activeSong?.id) {
    if (!fromId) return;
    const source = filteredSongs.length ? filteredSongs : songs;
    const index = Math.max(0, source.findIndex((song) => song.id === fromId));
    const ordered = [...source.slice(index + 1), ...source.slice(0, index + 1)];
    const next = ordered.find((song) => !isSongConfirmed(reviewMap[song.id] || {}));
    if (next) {
      setActiveSongId(next.id);
      const visibleIndex = filteredSongs.findIndex((song) => song.id === next.id);
      if (visibleIndex >= 0) setPage(Math.floor(visibleIndex / PAGE_SIZE));
    }
  }

  function exportReview() {
    const payload = {
      exportedAt: new Date().toISOString(),
      songCount: songs.length,
      stats,
      review: Object.fromEntries(Object.entries(reviewMap).sort(([a], [b]) => a.localeCompare(b)))
    };
    downloadJson(payload, "jp-asset-review.json");
  }

  function exportIssueReport() {
    const rows = songs.flatMap((song) => {
      const review = reviewMap[song.id] || {};
      const issues = [];
      if (review.jacket === "issue" || jacketState[song.id] === "error") issues.push("jacket");
      if (review.audio === "issue" || audioState[song.id] === "error" || !song.previewAudio) issues.push("audio");
      if (review.constants === "issue" || !song.charts.some((chart) => typeof chart.constant === "number")) issues.push("constant");
      if (!issues.length) return [];
      return [{
        id: song.id,
        title: song.title,
        artist: song.artist,
        category: song.category,
        version: song.version,
        issues,
        jacket: song.jacket,
        previewAudio: song.previewAudio || "",
        note: review.note || ""
      }];
    });
    downloadJson({ exportedAt: new Date().toISOString(), count: rows.length, rows }, "jp-asset-issues.json");
  }

  if (!activeSong) {
    return (
      <main className="admin-shell asset-admin-shell">
        <section className="asset-empty-state">
          <AlertCircle size={28} />
          <h1>曲库为空</h1>
          <p>请先生成并放入 src/data/importedSongs.json。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell asset-admin-shell">
      <header className="asset-admin-header">
        <div>
          <p className="eyebrow">MAIMAI CUP · JP ASSET REVIEW</p>
          <h1 className="admin-title">资源验收工作台</h1>
          <p className="admin-subtitle">逐首确认封面、30 秒音频预览和谱面定数。这里不再管理 YouTube 映射。</p>
        </div>
        <a className="ghost-action admin-back" href="/">返回赛事</a>
      </header>

      <section className="asset-review-stats" aria-label="资源审核概览">
        <StatCard label="曲库" value={songs.length} detail={`${stats.chartCount} 张谱面`} />
        <StatCard label="已三项确认" value={stats.confirmed} detail={`${percent(stats.confirmed, songs.length)}%`} tone="ok" />
        <StatCard label="封面异常" value={stats.jacketIssues} detail={`加载失败/人工标记`} tone={stats.jacketIssues ? "bad" : "ok"} />
        <StatCard label="音频缺失" value={stats.audioIssues} detail={`无 mp3 或加载失败`} tone={stats.audioIssues ? "bad" : "ok"} />
        <StatCard label="定数缺失" value={stats.constantIssues} detail={`${stats.constantCharts}/${stats.chartCount} 张有定数`} tone={stats.constantIssues ? "bad" : "ok"} />
      </section>

      <section className="asset-admin-toolbar">
        <label className="admin-search asset-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索曲名 / 歌手 / ID / 分类 / 版本" />
        </label>
        <select value={filter} onChange={(event) => setFilter(event.target.value as FilterMode)} aria-label="审核筛选">
          <option value="pending">待确认</option>
          <option value="issue">全部异常</option>
          <option value="jacketIssue">封面异常</option>
          <option value="audioIssue">音频异常</option>
          <option value="constantIssue">定数异常</option>
          <option value="noAudio">无音频路径</option>
          <option value="noConstant">无定数字段</option>
          <option value="ok">已确认</option>
          <option value="all">全部</option>
        </select>
        <button className="ghost-action" onClick={() => goNextPending()}>
          <ListChecks size={16} />
          下一首待确认
        </button>
        <button className="ghost-action" onClick={exportIssueReport}>
          <AlertCircle size={16} />
          导出异常
        </button>
        <button className="primary-inline" onClick={exportReview}>
          <Download size={16} />
          导出审核记录
        </button>
      </section>

      <div className="asset-admin-layout">
        <aside className="asset-song-queue">
          <div className="asset-queue-head">
            <b>歌曲队列</b>
            <span>{filteredSongs.length} 首</span>
          </div>
          <div className="asset-song-list">
            {pageItems.map((song) => (
              <button
                key={song.id}
                className={`asset-song-row ${song.id === activeSong.id ? "active" : ""}`}
                onClick={() => setActiveSongId(song.id)}
              >
                <img
                  src={song.jacket}
                  alt=""
                  loading="lazy"
                  onLoad={() => setJacketState((current) => ({ ...current, [song.id]: "ok" }))}
                  onError={() => setJacketState((current) => ({ ...current, [song.id]: "error" }))}
                />
                <span>
                  <b>{song.title}</b>
                  <small>{song.artist}</small>
                </span>
                <ReviewDots song={song} review={reviewMap[song.id] || {}} jacketState={jacketState[song.id]} audioState={audioState[song.id]} />
              </button>
            ))}
            {!pageItems.length ? (
              <div className="asset-empty-list">
                <Search size={22} />
                <b>没有结果</b>
                <span>换个筛选或搜索词。</span>
              </div>
            ) : null}
          </div>
          <div className="asset-pagination">
            <button className="ghost-action" disabled={safePage <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>上一页</button>
            <span>{safePage + 1} / {pageCount}</span>
            <button className="ghost-action" disabled={safePage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>下一页</button>
          </div>
        </aside>

        <section className="asset-review-panel">
          <div className="asset-song-titlebar">
            <div>
              <span>{activeSong.category} · {activeSong.version} · {activeSong.id}</span>
              <h2>{activeSong.title}</h2>
              <p>{activeSong.artist}</p>
            </div>
            <button className="primary-inline" onClick={() => markAllOk(activeSong)}>
              <ShieldCheck size={17} />
              三项确认
            </button>
          </div>

          <div className="asset-review-grid">
            <section className="asset-check-card jacket-check">
              <div className="asset-check-head">
                <div>
                  <ImageIcon size={18} />
                  <b>封面确认</b>
                </div>
                <StatusBadge value={activeReview.jacket} runtime={jacketState[activeSong.id]} />
              </div>
              <div className="asset-jacket-frame">
                <img
                  src={activeSong.jacket}
                  alt={`${activeSong.title} jacket`}
                  onLoad={() => setJacketState((current) => ({ ...current, [activeSong.id]: "ok" }))}
                  onError={() => setJacketState((current) => ({ ...current, [activeSong.id]: "error" }))}
                />
              </div>
              <code>{activeSong.jacket}</code>
              <div className="asset-check-actions">
                <button className="confirm-action" onClick={() => mark(activeSong.id, "jacket", "ok")}><CheckCircle2 size={16} />封面对</button>
                <button className="issue-action" onClick={() => mark(activeSong.id, "jacket", "issue")}><XCircle size={16} />封面错</button>
              </div>
            </section>

            <section className="asset-check-card audio-check">
              <div className="asset-check-head">
                <div>
                  <Volume2 size={18} />
                  <b>30 秒音频确认</b>
                </div>
                <StatusBadge value={activeReview.audio} runtime={audioState[activeSong.id]} missing={!activeSong.previewAudio} />
              </div>
              {activeSong.previewAudio ? (
                <>
                  <div className="asset-audio-stage">
                    <Music2 size={34} />
                    <audio
                      controls
                      preload="none"
                      src={activeSong.previewAudio}
                      onCanPlay={() => setAudioState((current) => ({ ...current, [activeSong.id]: "ok" }))}
                      onError={() => setAudioState((current) => ({ ...current, [activeSong.id]: "error" }))}
                    />
                  </div>
                  <code>{activeSong.previewAudio}</code>
                </>
              ) : (
                <div className="asset-missing-box">
                  <AlertCircle size={24} />
                  <b>没有 previewAudio 路径</b>
                  <span>重新导入曲库时加上 <code>--include-preview-placeholders</code>，或确认 MP3 已生成后再写入。</span>
                </div>
              )}
              <div className="asset-check-actions">
                <button className="confirm-action" onClick={() => mark(activeSong.id, "audio", "ok")} disabled={!activeSong.previewAudio}><CheckCircle2 size={16} />音频对</button>
                <button className="issue-action" onClick={() => mark(activeSong.id, "audio", "issue")}><XCircle size={16} />音频错/缺</button>
              </div>
            </section>
          </div>

          <section className="asset-check-card constants-check">
            <div className="asset-check-head">
              <div>
                <Gauge size={18} />
                <b>谱面等级与定数</b>
              </div>
              <StatusBadge value={activeReview.constants} missing={!activeSong.charts.some((chart) => typeof chart.constant === "number")} />
            </div>
            <p className="asset-help-text">
              定数在 <code>charts[].constant</code>，等级显示仍用 <code>charts[].level</code>，所以「13+」不会被改成小数。谱面杯会在卡片和结果页显示定数。
            </p>
            <ChartTable charts={activeSong.charts} />
            <div className="asset-check-actions">
              <button className="confirm-action" onClick={() => mark(activeSong.id, "constants", "ok")}><CheckCircle2 size={16} />定数对</button>
              <button className="issue-action" onClick={() => mark(activeSong.id, "constants", "issue")}><XCircle size={16} />定数有问题</button>
            </div>
          </section>

          <section className="asset-note-card">
            <label>
              <SlidersHorizontal size={16} />
              审核备注
            </label>
            <textarea
              value={activeReview.note || ""}
              onChange={(event) => updateNote(activeSong.id, event.target.value)}
              placeholder="例如：封面不是这首；音频开头空白太长；宴谱定数需要复核。"
            />
            <div className="asset-note-actions">
              <button className="ghost-action" onClick={() => clearReview(activeSong.id)}><RotateCcw size={16} />清除本首记录</button>
              <button className="ghost-action" onClick={() => goNextPending(activeSong.id)}><ListChecks size={16} />下一首待确认</button>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function ChartTable({ charts }: { charts: Chart[] }) {
  const sorted = [...charts].sort((a, b) => (difficultyOrder[a.difficulty] ?? 99) - (difficultyOrder[b.difficulty] ?? 99));
  return (
    <div className="asset-chart-table">
      <div className="asset-chart-row head">
        <span>难度</span>
        <span>等级</span>
        <span>定数</span>
        <span>谱师</span>
        <span>类型</span>
      </div>
      {sorted.map((chart) => (
        <div className="asset-chart-row" key={`${chart.difficulty}-${chart.type || "dx"}`}>
          <span className={`difficulty ${difficultyClass[chart.difficulty] || ""}`}>{chart.difficulty}</span>
          <b>Lv {chart.level}</b>
          <strong>{typeof chart.constant === "number" ? chart.constant.toFixed(1) : "缺失"}</strong>
          <span className="asset-chart-designer">{chart.designer || "maimaiNET"}</span>
          <span className="asset-chart-type">{chartTypeLabel(chart.type)}</span>
        </div>
      ))}
    </div>
  );
}

function chartTypeLabel(type: string | undefined) {
  if (type === "standard") return "SD谱";
  return "DX谱";
}

function StatCard({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: "ok" | "bad" }) {
  return (
    <div className={`asset-stat-card ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ReviewDots({
  song,
  review,
  jacketState,
  audioState
}: {
  song: Song;
  review: AssetReview;
  jacketState?: RuntimeState;
  audioState?: RuntimeState;
}) {
  return (
    <span className="asset-review-dots" aria-label="审核状态">
      <Dot value={review.jacket} runtime={jacketState} title="封面" />
      <Dot value={review.audio} runtime={audioState} title="音频" missing={!song.previewAudio} />
      <Dot value={review.constants} title="定数" missing={!song.charts.some((chart) => typeof chart.constant === "number")} />
    </span>
  );
}

function Dot({ value, runtime, missing, title }: { value?: ReviewValue; runtime?: RuntimeState; missing?: boolean; title: string }) {
  const className = value === "ok" ? "ok" : value === "issue" || runtime === "error" || missing ? "bad" : runtime === "ok" ? "runtime-ok" : "";
  return <span className={`asset-dot ${className}`} title={title} />;
}

function StatusBadge({ value, runtime, missing }: { value?: ReviewValue; runtime?: RuntimeState; missing?: boolean }) {
  if (value === "ok") return <span className="asset-status-badge ok"><CheckCircle2 size={14} />已确认</span>;
  if (value === "issue") return <span className="asset-status-badge bad"><XCircle size={14} />已标异常</span>;
  if (missing) return <span className="asset-status-badge bad"><AlertCircle size={14} />缺失</span>;
  if (runtime === "ok") return <span className="asset-status-badge runtime"><CheckCircle2 size={14} />可加载</span>;
  if (runtime === "error") return <span className="asset-status-badge bad"><AlertCircle size={14} />加载失败</span>;
  return <span className="asset-status-badge">待确认</span>;
}

function buildStats(reviewMap: ReviewMap, jacketState: Record<string, RuntimeState>, audioState: Record<string, RuntimeState>) {
  const chartCount = songs.reduce((sum, song) => sum + song.charts.length, 0);
  const constantCharts = songs.reduce((sum, song) => sum + song.charts.filter((chart) => typeof chart.constant === "number").length, 0);
  return {
    chartCount,
    constantCharts,
    confirmed: songs.filter((song) => isSongConfirmed(reviewMap[song.id] || {})).length,
    jacketIssues: songs.filter((song) => (reviewMap[song.id] || {}).jacket === "issue" || jacketState[song.id] === "error").length,
    audioIssues: songs.filter((song) => !song.previewAudio || (reviewMap[song.id] || {}).audio === "issue" || audioState[song.id] === "error").length,
    constantIssues: songs.filter((song) => !song.charts.some((chart) => typeof chart.constant === "number") || (reviewMap[song.id] || {}).constants === "issue").length
  };
}

function isSongConfirmed(review: AssetReview) {
  return review.jacket === "ok" && review.audio === "ok" && review.constants === "ok";
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/\s+/g, "");
}

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
