import { useMemo, useState } from "react";
import { songs } from "../data/songs";
import { parseYouTube, YouTubeSource, youtubeEmbedUrl, youtubeSources } from "../data/youtube";

const DRAFT_KEY = "mmc-yt-draft";
type Draft = Record<string, YouTubeSource>;

function loadDraft(): Draft {
  try {
    return { ...youtubeSources, ...JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") };
  } catch {
    return { ...youtubeSources };
  }
}

export default function AdminApp() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [query, setQuery] = useState("");
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);

  function persist(next: Draft) {
    setDraft(next);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
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

  const mappedCount = Object.keys(draft).length;

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
        <label className="admin-check">
          <input type="checkbox" checked={onlyUnmapped} onChange={(event) => setOnlyUnmapped(event.target.checked)} />
          只看未挂
        </label>
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
        改动只存在本浏览器草稿里。点「导出」下载 JSON，替换 <code>src/data/youtubeSources.json</code> 后重新构建部署才会对公开站生效。
      </p>

      <div className="admin-list">
        {filtered.slice(0, 300).map((song) => {
          const current = draft[song.id];
          return (
            <div className="admin-row" key={song.id}>
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
