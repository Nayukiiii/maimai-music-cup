# MAIMAI CUP / 舞萌本命之巅

一个静态 SPA 版 maimai 风格 MUSIC CUP MVP。当前版本使用本地曲库，无账号、无数据库、不抽取或转存音频，适合先快速部署到 ORACLE-ARM / OCI。

## 功能

- 歌曲杯：参赛单位是歌曲。
- 谱面杯：参赛单位是歌曲 + 谱面，突出难度、等级、谱师。
- 完整流程：配置 -> 抽签 -> 小组赛 -> 复活赛 -> 32 强淘汰赛 -> 结果页。
- 小组赛：48 个参赛项，12 组，每组 4 个，用户选 2 个直通。
- 复活赛：24 个落选项中选 8 个，组成 32 强。
- 淘汰赛：32 强、16 强、8 强、半决赛、决赛。
- 结果页：冠军、亚军、四强、冠军晋级路径、生成分享 PNG。
- YouTube 试听：只在用户点击「试听」时挂载官方 `youtube-nocookie.com` iframe。
- 私密 Admin：`/admin` 使用 Nginx Basic Auth，支持本地编辑 YouTube 链接并导出构建期 JSON。

## 本地开发

需要 Node.js 20+。

```bash
cd /home/opc/PluginTest/maimai-music-cup
npm install
npm run dev
```

默认开发地址：

```text
http://localhost:5173
```

## 构建

```bash
npm run build
```

构建产物会输出到 `dist/`。这是纯静态文件，可以由 Nginx、Caddy、对象存储或任意静态服务托管。

## 曲库替换方式

mock 曲库集中在：

```text
src/data/mockSongs.ts
```

后续替换真实 maimai 曲库时，保持 `Song` 字段结构即可：

```ts
{
  id: "unique-song-id",
  title: "Song Title",
  artist: "Artist",
  category: "分类",
  version: "版本",
  jacket: "/jackets/song-id.png",
  previewAudio: "/assets/previews/song-id.mp3",
  bpm: 180,
  charts: [
    {
      difficulty: "Master",
      level: "14",
      designer: "谱师名"
    }
  ]
}
```

如果使用真实曲绘，建议把图片放到 `public/jackets/`，然后把 `jacket` 写成 `/jackets/xxx.png`。Vite 会原样复制 `public/` 到最终站点根目录。

## 音频和封面资产方案

不要把未授权的完整音频或官方曲绘直接打包发布。封面当前可以使用本地缓存资源；试听推荐使用官方 iframe 嵌入或你有权发布的短片段。

### YouTube 试听源

公开站读取构建期文件：

```text
src/data/youtubeSources.json
```

格式按 `songId` 归属，歌曲杯和谱面杯共用同一首歌的试听源：

```json
{
  "song-id": {
    "videoId": "YouTube视频ID",
    "start": 30
  }
}
```

合规边界：本站只使用 YouTube 官方 iframe 嵌入播放器，不做任何音频抽取、下载、转存。页面初次加载不会请求 YouTube，只有点击卡片里的「试听」才会挂载 iframe。

### Admin 管理页

`/admin` 是一个本地编辑器入口，由 Nginx Basic Auth 保护。它不会直接修改线上数据，改动先存在当前浏览器的 `localStorage` 草稿里，点击「导出」后下载 `youtubeSources.json`，再覆盖 `src/data/youtubeSources.json` 并重新构建部署。

部署前先生成 admin 口令文件：

```bash
docker run --rm httpd:2.4-alpine htpasswd -nbB admin 'CHANGE_ME_STRONG_PASSWORD' > deploy/.htpasswd
chmod 644 deploy/.htpasswd
docker compose up -d --build
```

然后访问：

```text
http://你的域名/admin
```

输入 `admin` 和你设置的密码。没有 `deploy/.htpasswd` 时 Nginx 容器会启动失败；建议只在 HTTPS 域名下使用 `/admin`，否则 Basic Auth 密码会明文传输。

导出后生效流程：

```bash
# 用浏览器导出的文件覆盖 src/data/youtubeSources.json
docker compose up -d --build
```

如果你有可发布的静态试听片段，也可以继续使用“静态资产包”：

- 封面：放到 `public/assets/jackets/`，建议 `webp`，尺寸 512x512 或 768x768。
- 试听：放到 `public/assets/previews/`，建议 15-30 秒 `mp3/aac` 片段。
- 映射：在 `src/data/assetOverrides.ts` 里按歌曲 id 覆盖 `jacket` 和 `previewAudio`。

示例：

```ts
export const assetOverrides = {
  "mock-001": {
    jacket: "/assets/jackets/mock-001.webp",
    previewAudio: "/assets/previews/mock-001.mp3"
  }
};
```

可行来源：

- 你自己整理且有发布权的曲绘和试听片段。
- 曲师/版权方明确授权的宣传素材。
- 只做跳转或嵌入的外部平台链接，不在本站下载、转存或二次分发音频。
- 没授权时继续使用当前生成式占位封面，不提供音频。

如果已经确认某批公开资源允许本站使用，可以复制 `asset-sources.example.json` 为 `asset-sources.json`，填写 URL 和 `licenseNote`，然后运行：

```bash
npm run assets:import
```

这会把封面导入到 `public/assets/jackets/`，把 30 秒试听片段导入到 `public/assets/previews/`，并自动生成映射文件。

## 导入公开 CN 曲库

可以从 `CrazyKidCN/maimaiDX-CN-songs-database` 导入国服曲库数据：

```bash
docker compose run --rm cn-song-importer
docker compose up -d --build
```

脚本会读取公开的 `maidata.json`，转换成 `src/data/importedSongs.json`，并把封面缓存到 `public/assets/jackets/cn-db/`。如果不想缓存封面、只用远程 URL：

```bash
docker compose run --rm cn-song-importer node scripts/import-cn-songs.mjs
```

注意：该数据源没有 BPM 和谱师，导入器会把 BPM 设为 `0`，谱师设为 `maimaiNET`。等级筛选完全按 JSON 的 `level` 字段来，`13+` 就是 `13+`。

服务器宿主机没有安装 Node/npm 时，用 Docker 跑导入器：

```bash
cp asset-sources.example.json asset-sources.json
# 编辑 asset-sources.json，换成真实可用的资源 URL
docker compose run --rm asset-importer
docker compose up -d --build
```

## Docker 运行

```bash
cd /home/opc/PluginTest/maimai-music-cup
docker compose up -d --build
```

默认访问：

```text
http://服务器IP:18080
```

如需固定使用 8080：

```bash
APP_PORT=8080 docker compose up -d --build
```

停止：

```bash
docker compose down
```

## ORACLE-ARM / OCI 最快部署

以下方式适合 OCI Ampere A1 / ARM 实例，架构是 Vite build -> Nginx serve -> 反代挂域名。

1. 准备实例

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

2. 上传或拉取项目

```bash
git clone <你的仓库地址>
cd maimai-music-cup
```

如果不是 Git 仓库，也可以用 `scp` 或 OCI Cloud Shell 上传整个 `maimai-music-cup` 文件夹。

3. 启动容器

```bash
docker compose up -d --build
docker compose ps
```

4. OCI 安全列表 / NSG

在 OCI 控制台放行入站端口：

```text
TCP 18080
```

如果后续用 Nginx Proxy Manager、Caddy 或宿主机 Nginx 反代到这个容器，再放行 `80/443`。

5. 域名反代示例

宿主机 Nginx 可以把域名转到容器端口：

```nginx
server {
  listen 80;
  server_name cup.example.com;

  location / {
    proxy_pass http://127.0.0.1:18080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

然后用 Certbot 或 Caddy 自动签 HTTPS 证书即可。

## 项目结构

```text
maimai-music-cup/
  src/
    components/SongCard.tsx
    data/mockSongs.ts
    lib/tournament.ts
    App.tsx
    main.tsx
    styles.css
  Dockerfile
  nginx.conf
  docker-compose.yml
```
