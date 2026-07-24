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

## 曲库与资源

当前正式曲库集中在：

```text
src/data/importedSongs.json
```

`src/data/mockSongs.ts` 只在正式曲库为空时作为开发兜底。替换曲库时保持 `Song` 字段结构：

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

`/admin` 是由 Nginx Basic Auth 保护的静态管理入口，顶部可切换两个工作区：

- `YouTube 音源匹配`：批量导入候选、连续审核、保存草稿并导出 `youtubeSources.json`。
- `本地资源验收`：逐首检查封面、30 秒试听、等级/定数并导出问题报告。

两个工作区都不会直接修改服务器文件；浏览器只保存 `localStorage` 草稿，最终由管理员导出 JSON、覆盖源码中的对应文件并重新构建部署。

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

`npm run dev` 使用 Vite，不经过 Nginx，因此本地开发时 `/admin` 不会触发 Basic Auth。不要把 Vite 开发端口直接暴露到公网；正式环境必须经过 Nginx 容器或等价的反向代理保护。

YouTube 音源匹配支持：

- 大曲库工作台：左侧分页歌曲队列，右侧单曲匹配区，默认只显示未匹配歌曲。
- 按曲名 / 歌手 / song ID 搜索，并筛选全部、已映射或未映射歌曲；支持 25 / 50 / 100 首分页。
- 手动粘贴 YouTube URL / 视频 ID，保存后立即试听，或“保存并下一首”连续处理。
- 支持 Enter 保存、Ctrl / Command + Enter 保存并进入下一首，以及一键跳到下一首未匹配歌曲。
- 可编辑搜索关键词，并一键切换“曲名 + 歌手”“maimai 音源”“官方 / Topic”三种搜索模板。
- 填写 YouTube Data API Key 时一次取得最多 8 条结果，按曲名、歌手、官方音源特征排序后展示前 6 个候选；不填写时使用当前关键词打开 YouTube 搜索页。
- 候选可逐条试听、选用或“确认并下一首”；不会静默采用第一条结果，并会提示同一视频是否已被其他歌曲使用。
- 候选队列拆成「严格推荐」和「需人工核对」；严格推荐同时检查曲名命中、分数、第一/第二名分差、负面关键词和视频 ID 去重。
- 支持批量采用严格推荐，并自动保存一次操作前快照；发现问题时可以立即撤销整批。
- 候选页无需先点击第一条：`Space` 试听当前推荐/已选项，`Enter` 确认并进入下一首，`1–6` 切换候选，`S` 暂时跳过。
- 在“仅未匹配”队列中保存后仍停留在当前歌曲供试听核对，只有点击“保存并下一首”才会继续推进。
- API Key 只放在当前浏览器标签页的 `sessionStorage`，不会写入源码、JSON 或构建产物。
- 自动保存 `localStorage` 草稿，并显示待导出变更数。
- 支持按 `songId + URL` 或 `曲名 + 歌手 + URL` 的制表符格式批量粘贴映射。
- 导入、匹配、保存、试听与导出均有 loading / success / error 状态。
- 导出结果固定为格式化的 `youtubeSources.json`；Admin 不会直接写服务器文件。

顶部「下一首未匹配 / 下一首候选」会在当前搜索范围内继续推进。需要放弃未导出改动时，可用「放弃草稿」恢复到当前构建版本。

本地资源验收工作区可通过 `/admin?workspace=assets` 直达，支持待确认/异常/缺音频/缺定数筛选、三项确认、审核备注，以及导出完整审核记录或异常报告。

### 一千首以上曲库的快速审核

YouTube Data API 的默认 `search.list` 搜索额度不足以一次处理完整曲库。大曲库推荐先在本地用 `yt-dlp` 生成候选元数据包，再导入 Admin 连续审核。该命令只读取搜索结果的标题、频道、缩略图和视频 ID，不下载视频或音频。

先安装并确认 `yt-dlp` 可用：

```bash
# Windows 也可以使用：py -m pip install -U yt-dlp
python3 -m pip install -U yt-dlp
yt-dlp --version
```

在项目根目录生成候选包：

```bash
npm run candidates:generate
```

默认行为：

- 只扫描 `youtubeSources.json` 中尚未映射的歌曲。
- 每首歌生成 5 个候选，默认请求间隔 900ms。
- 默认使用 2 个并发 worker；每个 worker 独立遵守请求间隔。
- 结果保存为被 `.gitignore` 排除的 `youtubeCandidates.json`。
- 每处理一首就写入检查点；按 `Ctrl+C` 中断后重新运行同一命令会自动跳过已完成歌曲。
- 搜索失败的歌曲保留在错误记录中，下次运行会自动重试。

需要分批处理时：

```bash
npm run candidates:generate -- --limit 200 --offset 0
npm run candidates:generate -- --limit 200 --offset 200
```

网络稳定时可适当提高并发，最高限制为 6；出现限流时应降低并发或增大 `--delay`：

```bash
npm run candidates:generate -- --concurrency 3 --delay 1200
```

生成完成后进入 `/admin`：

1. 点击「导入候选包」，选择 `youtubeCandidates.json`。
2. 先点击「批量采用严格推荐」，必要时可用旁边的撤销按钮恢复。
3. 进入「需人工核对」，默认按匹配度排序，也可以切换为“需核对优先”或曲库顺序。
4. 对推荐项按 `Space` 试听、`Enter` 确认并下一首；需要换候选时按 `1–6`，无法判断时按 `S`。
5. 集中处理「无候选」和「已跳过」队列。
6. 最后导出 `youtubeSources.json` 并重新构建部署。

候选包与跳过进度保存在当前浏览器的 `localStorage` 中，不会上传到服务器，也不会写进前端构建产物。

浏览器缓存候选时会省略可由视频 ID 重建的缩略图 URL，降低千首曲库触发容量上限的概率；仍建议生成和导入 200–300 首一批。

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
npm run release:check
docker compose up -d --build
```

`release:check` 校验歌曲 ID、谱面唯一性、原始等级、定数和 YouTube 映射。JP 封面与试听属于可选的部署机私有资源，不是代码发布条件；没有这些文件时页面会使用后备封面，并在试听不可用时给出降级提示。

JP 封面与试听有版权风险，以下目录同时被 `.gitignore` 和 `.dockerignore` 排除，不能提交到 GitHub，也不会被复制进可推送的 Docker 镜像：

```text
public/assets/jackets/jp-db/
public/assets/previews/jp-db/
deploy/private-assets/
```

如果你在部署机上拥有合法可用、但不能进入远程仓库的资源，可以放在：

```text
deploy/private-assets/assets/jackets/jp-db/
deploy/private-assets/assets/previews/jp-db/
```

然后使用只读运行时挂载启动：

```bash
mkdir -p deploy/private-assets/assets/jackets/jp-db
mkdir -p deploy/private-assets/assets/previews/jp-db
npm run release:check:assets
docker compose -f docker-compose.yml -f docker-compose.private-assets.yml up -d --build
```

`release:check:assets` 默认会同时检查 `public/` 和 `deploy/private-assets/`。资源放在其他服务器目录时，可以临时指定根目录：

```bash
MMC_PRIVATE_ASSET_ROOT=/srv/maimai-private-assets npm run release:check:assets
```

这种方式只把文件挂载到正在运行的 Nginx 容器，资源不进入 Git 历史、Docker build context 或镜像层。若没有合法资源，直接使用基础 `docker compose up -d --build` 即可。

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

3. 生成 Admin 口令并启动容器

```bash
mkdir -p deploy
docker run --rm -it -v "$PWD/deploy:/work" httpd:2.4-alpine \
  htpasswd -cB /work/.htpasswd admin
chmod 644 deploy/.htpasswd
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:18080/healthz
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
    admin/YouTubeAdmin.tsx
    components/SongCard.tsx
    data/importedSongs.json
    data/youtubeSources.json
    data/mockSongs.ts
    lib/tournament.ts
    App.tsx
    tournament-polish.css
    admin-polish.css
    main.tsx
    styles.css
  scripts/generate-youtube-candidates.mjs
  Dockerfile
  nginx.conf
  docker-compose.yml
  docker-compose.private-assets.yml
```

## 赛事规则与数据约束

- 抽签前必须得到至少 48 个唯一参赛项；抽签结果会再次校验 48 个 ID 全部唯一。
- 歌曲杯参赛 ID 对应 `song.id`。
- 谱面杯参赛 ID 由 song、difficulty 与 chart type 组成；同一歌曲的同难度同类型谱面会先做语义去重，再参与抽签。
- 谱面杯一次只能选择一个 difficulty，因此 Basic、Advanced、Expert、Master 与 Re:Master 不会跨难度配对。
- 赛事记录保留从 32 强到决赛的 31 场结果；海报左右 bracket 均从 32 强向中央决赛汇聚。

## 安全说明

- `deploy/.htpasswd`、`.env*` 和本地资产源文件已由 `.gitignore` 排除。
- Basic Auth 只应在 HTTPS 域名下使用；React 页面本身没有伪登录逻辑。
- 不要把 GitHub Token、Admin 密码或 YouTube API Key 提交到仓库。
- Nginx 提供基础安全响应头、隐藏文件拒绝访问和 `/healthz` 容器健康检查。
