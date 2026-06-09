# Web Video Studio

一个前后端一体的网页视频生成工作台。你可以输入主题、文章、大纲或口播稿，先生成可编辑的 16:9 网页视频草稿，逐章节预览和修改每一屏内容，确认后再合成中文口播音频，并导出 MP4。

这个项目适合做科普视频、产品讲解、课程短片、B 站 / YouTube / 视频号录屏素材，以及任何“动态网页演示转视频”的内容生产流程。

## 核心能力

- 草稿生成：输入标题和内容，后端自动拆成章节、屏幕和口播段落。
- 分页工作台：创建草稿、编辑与预览、合成与导出、项目库 / 设置分开管理。
- 逐屏编辑：可修改项目标题、章节标题、每一屏口播 / 主画面文字。
- 逐章节预览：每个章节、每一屏都可以单独跳转预览。
- 中文 TTS：支持 OpenAI、edge-tts、macOS say、Piper 本地模型。
- MP4 导出：用 Playwright 截取 1920x1080 网页帧，再用 ffmpeg 合成视频。
- 项目库：项目保存在本地 storage，可重复打开、编辑、合成和导出。
- 后端 API：API key 只放后端 `.env`，不暴露到浏览器。

## 技术栈

- 前端：React 19、Vite、TypeScript
- 后端：Node.js、Express
- 视频渲染：Playwright + Chrome + ffmpeg / ffprobe
- 音频合成：OpenAI TTS、edge-tts、macOS say、Piper
- 数据存储：本地文件系统 `presentation/storage/projects/<id>/`

## 目录结构

```text
.
├── README.md                         # 当前项目总说明
├── script.md                         # 《什么是 AI Agent》中文口播稿
├── outline.md                        # 《什么是 AI Agent》视频结构和节奏规划
├── .codex/skills/web-video-presentation/
│   └── SKILL.md                      # Codex 使用的网页视频 presentation skill
└── presentation/
    ├── README.md                     # presentation 子项目说明
    ├── package.json                  # 前后端脚本和依赖
    ├── .env.example                  # 后端运行配置模板
    ├── server/                       # Express API、TTS、项目存储、MP4 渲染
    ├── src/
    │   ├── studio/                   # 视频生成工作台 UI
    │   ├── generated/                # 生成项目的运行时组件
    │   ├── chapters/                 # 内置《什么是 AI Agent》样片章节
    │   ├── components/               # 播放器、进度条、自动播放等组件
    │   └── styles/                   # 全局样式和主题 tokens
    └── storage/                      # 本地生成项目、音频、视频，默认不提交
```

## 环境要求

基础运行：

- Node.js 20+，建议 Node.js 22+
- npm

音频 / 视频导出按需安装：

- Chrome：MP4 导出时 Playwright 会启动本机 Chrome
- ffmpeg / ffprobe：导出 MP4、macOS say 转 MP3 时需要
- edge-tts：使用 `edge-tts` provider 时需要命令行工具
- Piper：使用本地 TTS 模型时需要 Piper 可执行文件和 voice model
- OpenAI API Key：使用 `openai` provider 时需要

macOS 可以这样安装 ffmpeg：

```bash
brew install ffmpeg
```

## 快速启动

进入子项目：

```bash
cd presentation
npm install
cp .env.example .env
```

启动后端 API：

```bash
npm run server
```

后端默认监听：

```text
http://127.0.0.1:8787
```

再开一个终端启动前端：

```bash
cd presentation
npm run dev
```

打开工作台：

```text
http://127.0.0.1:5174/studio
```

也可以打开内置样片：

```text
http://127.0.0.1:5174/
```

## 使用流程

1. 打开 `/studio`，进入“创建草稿”。
2. 输入标题和内容，例如“什么是 AI Agent”。
3. 选择 TTS provider 和音色，点击“生成草稿”。
4. 进入“编辑与预览”，逐章节查看网页画面。
5. 修改章节标题或每一屏口播 / 主画面文字。
6. 点击“保存并刷新预览”。
7. 进入“合成与导出”，先合成音频，再导出 MP4。
8. 在“项目库 / 设置”里打开历史项目或查看后端状态。

如果草稿有未保存修改，系统会禁用“合成音频”和“导出 MP4”，防止音频、视频和最新草稿不一致。

## 页面入口

| 地址 | 说明 |
| --- | --- |
| `/studio` | 视频生成工作台 |
| `/` | 内置《什么是 AI Agent》样片 |
| `/?project=<id>` | 打开某个生成项目 |
| `/?project=<id>&renderStep=<n>` | 打开某个项目的第 n 屏，供渲染器截图 |
| `/?project=<id>&audio=1` | 带音频预览 |
| `/?project=<id>&auto=1` | 自动播放预览 |

## 后端配置

复制 `.env.example`：

```bash
cd presentation
cp .env.example .env
```

常用配置：

```bash
WEB_VIDEO_SERVER_PORT=8787
WEB_VIDEO_RENDER_BASE_URL=http://127.0.0.1:5174
WEB_VIDEO_CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
WEB_VIDEO_RENDER_FPS=30
WEB_VIDEO_RENDER_SETTLE_MS=1400

WEB_VIDEO_TTS_PROVIDER=edge-tts
WEB_VIDEO_TTS_VOICE=zh-CN-YunxiNeural
WEB_VIDEO_TTS_FALLBACK=say
WEB_VIDEO_TTS_FALLBACK_VOICE=Tingting

OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TTS_MODEL=gpt-4o-mini-tts

PIPER_BIN=piper
PIPER_MODEL=
```

配置说明：

| 变量 | 说明 |
| --- | --- |
| `WEB_VIDEO_SERVER_PORT` | 后端 API 端口，默认 `8787` |
| `WEB_VIDEO_RENDER_BASE_URL` | 后端渲染 MP4 时访问的前端地址 |
| `WEB_VIDEO_CHROME_PATH` | 本机 Chrome 可执行文件路径 |
| `WEB_VIDEO_RENDER_FPS` | 导出视频帧率 |
| `WEB_VIDEO_RENDER_SETTLE_MS` | 每屏截图前等待动画稳定的时间 |
| `WEB_VIDEO_TTS_PROVIDER` | 默认 TTS provider |
| `WEB_VIDEO_TTS_VOICE` | 默认音色 |
| `WEB_VIDEO_TTS_FALLBACK` | TTS 失败时的回退 provider，设为 `none` 可关闭 |
| `OPENAI_API_KEY` | OpenAI TTS API key，只放后端 |
| `OPENAI_BASE_URL` | OpenAI API base URL |
| `OPENAI_TTS_MODEL` | OpenAI TTS 模型 |
| `PIPER_BIN` | Piper 可执行文件路径 |
| `PIPER_MODEL` | Piper voice `.onnx` 模型路径 |

## TTS Provider

### OpenAI

适合质量更稳定的中文口播。API key 只配置在后端 `.env`：

```bash
WEB_VIDEO_TTS_PROVIDER=openai
WEB_VIDEO_TTS_VOICE=coral
OPENAI_API_KEY=sk-...
OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

### edge-tts

默认 provider。它不需要 API key，但会访问 Microsoft TTS 服务，不是完全离线：

```bash
WEB_VIDEO_TTS_PROVIDER=edge-tts
WEB_VIDEO_TTS_VOICE=zh-CN-YunxiNeural
```

如果偶发 `NoAudioReceived`，默认会回退到 macOS `say`。不想回退可以设置：

```bash
WEB_VIDEO_TTS_FALLBACK=none
```

### macOS say

适合完全本机离线合成，声音质量一般，但稳定：

```bash
WEB_VIDEO_TTS_PROVIDER=say
WEB_VIDEO_TTS_VOICE=Tingting
```

需要 `ffmpeg` 把 aiff 转成 mp3。

### Piper 本地模型

适合“下载 TTS 模型到本地”的路线。模型文件不要提交到仓库，放本机目录后用 `.env` 指向：

```bash
WEB_VIDEO_TTS_PROVIDER=piper
PIPER_BIN=/path/to/piper
PIPER_MODEL=/path/to/voice.onnx
```

中文效果取决于你下载的 Piper voice。

## MP4 导出原理

点击“导出 MP4”后，后端会启动 render job：

1. 如果需要，先合成所有口播音频。
2. 用 Playwright 打开 `WEB_VIDEO_RENDER_BASE_URL/?project=<id>&renderStep=<n>`。
3. 每一屏截一张 1920x1080 PNG 帧。
4. 用真实音频时长计算每屏停留时间；没有音频时按文字长度估算。
5. 用 ffmpeg 拼接帧图、音频轨，生成 `video.mp4`。

导出结果位置：

```text
presentation/storage/projects/<id>/render/video.mp4
```

前端下载地址：

```text
/storage/projects/<id>/render/video.mp4
```

## API

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 查看后端状态、默认 TTS、Chrome 配置 |
| `GET` | `/api/projects` | 列出项目库 |
| `GET` | `/api/projects/:id` | 读取单个项目 |
| `POST` | `/api/projects` | 根据标题和内容创建草稿 |
| `PUT` | `/api/projects/:id` | 保存草稿标题和章节内容 |
| `POST` | `/api/projects/:id/synthesize` | 合成项目音频 |
| `POST` | `/api/projects/:id/render` | 导出项目 MP4 |

项目数据结构保存在：

```text
presentation/storage/projects/<id>/project.json
```

生成文件包括：

```text
presentation/storage/projects/<id>/audio/<chapter>/<step>.mp3
presentation/storage/projects/<id>/render/video.mp4
```

## 常用命令

在 `presentation/` 目录下执行：

| 命令 | 说明 |
| --- | --- |
| `npm install` | 安装依赖 |
| `npm run dev` | 启动 Vite 前端 |
| `npm run server` | 启动 Express 后端 |
| `npm run dev:server` | 同 `npm run server` |
| `npm run build` | TypeScript 检查并构建前端 |
| `npm run lint` | 运行 ESLint |
| `npm run preview` | 预览构建产物 |
| `npm run extract-narrations` | 抽取内置章节口播 |
| `npm run synthesize-audio` | 用脚本合成内置样片音频 |

## 生产构建

```bash
cd presentation
npm install
npm run build
npm run server
```

后端会同时提供 API、`/storage/projects` 静态资源，以及 `dist/` 前端构建产物。

如果部署到远程服务器，需要把 `.env` 中的 `WEB_VIDEO_RENDER_BASE_URL` 改成后端渲染器能访问到的前端地址。

## 常见问题

### 页面能打开，但创建项目失败

确认后端是否启动：

```bash
cd presentation
npm run server
```

前端通过 Vite proxy 把 `/api` 和 `/storage` 转发到 `http://127.0.0.1:8787`。

### 端口被占用

检查端口：

```bash
lsof -i :5174
lsof -i :8787
```

可以修改 `presentation/vite.config.ts` 的 Vite 端口，或修改 `.env` 里的 `WEB_VIDEO_SERVER_PORT`。

### OpenAI TTS 报错

确认后端 `.env` 里配置了：

```bash
OPENAI_API_KEY=sk-...
WEB_VIDEO_TTS_PROVIDER=openai
```

不要把 API key 写进前端代码、浏览器 localStorage 或提交到 Git。

### 导出 MP4 报 Chrome not found

设置正确的 Chrome 路径：

```bash
WEB_VIDEO_CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

### 导出 MP4 报 ffmpeg / ffprobe not found

安装 ffmpeg：

```bash
brew install ffmpeg
```

### 修改草稿后无法合成或导出

这是预期行为。先点击“保存并刷新预览”，再进入“合成与导出”。

## Git 忽略策略

仓库会提交源码、脚本、文档和 Codex skill；不会提交：

- `presentation/node_modules/`
- `presentation/dist/`
- `presentation/storage/`
- `.playwright-mcp/`
- `.env`
- 日志文件

本地生成的视频、音频和项目数据都在 `presentation/storage/`，需要单独备份或导出，不会随 Git 提交。
