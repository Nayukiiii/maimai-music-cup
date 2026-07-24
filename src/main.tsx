import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./tournament-polish.css";
// 配色重做层，必须最后加载。若确定采用，应折进 styles.css 而不是长期保留为第 3 层。
import "./theme-sakura.css";

// YouTube 音源映射 Admin 已停用：试听改为直接使用服务器本地 mp3
// (public/assets/previews/)，曲库 1587 首已全部挂好 previewAudio，
// 不再需要外部音源映射。以下文件保留在仓库但不参与构建：
//   src/admin/AdminApp.tsx / src/admin/YouTubeAdmin.tsx
//   src/data/youtube.ts / src/components/YouTubePreview.tsx / src/admin-polish.css
// 如需恢复：把 admin-polish.css 的 import 与下面的 lazy 分支改回即可。
const isAdmin = window.location.pathname.replace(/\/+$/, "").endsWith("/admin");

function AdminDisabled() {
  return (
    <main className="app-shell">
      <div className="topbar">
        <div>
          <p className="eyebrow">MAIMAI CUP</p>
          <h1>Admin 已停用</h1>
        </div>
      </div>
      <section className="stage phase-panel">
        <p>试听音源已改为服务器本地文件，不再需要 YouTube 映射后台。</p>
        <p>
          <a href="/">返回赛事首页</a>
        </p>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isAdmin ? <AdminDisabled /> : <App />}</React.StrictMode>
);
