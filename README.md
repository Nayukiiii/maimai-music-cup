# MAIMAI CUP / 舞萌本命之巅

一个可直接游玩的 maimai 歌曲 / 谱面淘汰杯。第一屏就是赛事配置工具，视觉采用街机控制台、霓虹、樱花与正式赛事转播语言；项目保持纯静态 SPA，无账号、数据库或业务后端，适合部署到 ORACLE-ARM / OCI。

线上地址：<https://maimai.utautai.org/>

## 功能

- 歌曲杯：参赛单位是歌曲。
- 歌曲杯只提供分类、版本和随机种子，不出现难度、等级或定数筛选。
- 谱面杯：参赛单位是歌曲 + 谱面，整届固定一个难度；支持按原始等级或内部定数范围筛选。
- 等级严格显示曲库 `level` 原字段，例如 `13+` 始终显示为 `13+`，不会改写成小数。
- 完整流程：配置 -> 抽签 -> 小组赛 -> 复活赛 -> 32 强淘汰赛 -> 结果页。
- 小组赛：48 个参赛项，12 组，每组 4 个，用户选 2 个直通。
- 复活赛：24 个落选项中选 8 个，组成 32 强。
- 淘汰赛：32 强、16 强、8 强、半决赛、决赛。
- 结果页：冠军、亚军、四强、冠军晋级路径、完整 32 强记录和正式赛事海报 PNG。
- 可复现抽签：随机种子会显示在各阶段与分享海报中。
- 移动端：小组卡、复活池、对决操作、赛事进度和 Admin 均针对 390px 宽度适配。
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
      level: "13+",
      constant: 13.8,
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

部署前先生成 admin 口令文件。推荐交互式输入密码，避免把密码留在 shell history：

```bash
mkdir -p deploy
docker run --rm -it -v "$PWD/deploy:/work" httpd:2.4-alpine \
  htpasswd -cB /work/.htpasswd admin
chmod 644 deploy/.htpasswd
docker compose config
docker compose up -d --build
```

然后访问：

```text
https://你的域名/admin
```

输入 `admin` 和你设置的密码。没有 `deploy/.htpasswd` 时 Nginx 容器会启动失败；建议只在 HTTPS 域名下使用 `/admin`，否则 Basic Auth 密码会明文传输。

Admin 支持：

- 大曲库工作台：左侧分页歌曲队列，右侧单曲匹配区，默认只显示未匹配歌曲。
- 按曲名 / 歌手 / song ID 搜索，并筛选全部、已映射或未映射歌曲；支持 25 / 50 / 100 首分页。
- 手动粘贴 YouTube URL / 视频 ID，保存后立即试听，或“保存并下一首”连续处理。
- 支持 Enter 保存、Ctrl / Command + Enter 保存并进入下一首，以及一键跳到下一首未匹配歌曲。
- 按 `曲名 + 歌手 + maimai` 自动匹配；填写 YouTube Data API Key 时请求首条候选，不填写时打开 YouTube 搜索页。
- 自动匹配只填入候选，不会直接保存；可先试听确认，避免错误覆盖。
- API Key 只放在当前浏览器标签页的 `sessionStorage`，不会写入源码、JSON 或构建产物。
- 自动保存 `localStorage` 草稿，并显示待导出变更数。
- 支持按 `songId + URL` 或 `曲名 + 歌手 + URL` 的制表符格式批量粘贴映射。
- 导入、匹配、保存、试听与导出均有 loading / success / error 状态。
- 导出结果固定为格式化的 `youtubeSources.json`；Admin 不会直接写服务器文件。

顶部「预览下一首」会在当前搜索和筛选范围内顺序检查已映射音源。需要放弃未导出改动时，可用「放弃草稿」恢复到当前构建版本。

导出后生效流程：

```bash
# 用浏览器导出的文件覆盖 src/data/youtubeSources.json
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:18080/healthz
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

注意：该数据源没有 BPM、谱师和定数，导入器会把 BPM 设为 `0`，谱师设为 `maimaiNET`，界面会禁用定数筛选。等级筛选完全按 JSON 的 `level` 字段来，`13+` 就是 `13+`。换用含 `constant` 的曲库后，定数筛选会自动启用。

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
    admin/AdminApp.tsx
    components/SongCard.tsx
    data/importedSongs.json
    data/youtubeSources.json
    data/mockSongs.ts
    lib/tournament.ts
    App.tsx
    main.tsx
    styles.css
  Dockerfile
  nginx.conf
  docker-compose.yml
```

## 赛事规则与数据约束

- 抽签前必须得到至少 48 个唯一参赛项；抽签结果会再次校验 48 个 ID 全部唯一。
- 歌曲杯参赛 ID 对应 `song.id`。
- 谱面杯参赛 ID 由 song、difficulty、chart type、constant / level 与谱面序号共同组成，防止同一 `song/chart` 被重复抽入。
- 谱面杯一次只能选择一个 difficulty，因此 Basic、Advanced、Expert、Master 与 Re:Master 不会跨难度配对。
- 赛事记录保留从 32 强到决赛的 31 场结果；海报左右 bracket 均从 32 强向中央决赛汇聚。

## 安全说明

- `deploy/.htpasswd`、`.env*` 和本地资产源文件已由 `.gitignore` 排除。
- Basic Auth 只应在 HTTPS 域名下使用；React 页面本身没有伪登录逻辑。
- 不要把 GitHub Token、Admin 密码或 YouTube API Key 提交到仓库。
- Nginx 提供基础安全响应头、隐藏文件拒绝访问和 `/healthz` 容器健康检查。
