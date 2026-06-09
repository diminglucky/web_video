# Web Video Studio

前后端一体的网页视频生成器。你在 Studio 输入主题、文章、大纲或口播稿，后端先生成一个可预览、可编辑的 16:9 网页视频草稿；确认每一屏内容后，再合成中文口播音频、导出 MP4。

## 启动

```bash
npm install
cp .env.example .env
npm run dev:server
npm run dev
```

- Studio: http://127.0.0.1:5174/studio
- 静态样片: http://127.0.0.1:5174/
- 生成结果: http://127.0.0.1:5174/?project=<id>

后端默认监听 `127.0.0.1:8787`，Vite 会把 `/api` 和 `/storage` 代理到后端。

## 使用流程

1. 在 Studio 输入标题和内容，点击“生成并展示草稿”。
2. 右侧会自动展示网页预览，左侧会出现逐屏编辑器。
3. 通过右侧章节 / 屏幕导航，或左侧每屏旁边的“预览这一屏”，定位预览任意章节和画面。
4. 修改章节标题或每一屏口播 / 主画面文字。
5. 点击“保存并刷新预览”。保存草稿会清理旧音频和旧 MP4，避免产物和草稿不一致。
6. 确认预览没问题后，再点击“合成音频”或“导出 MP4”。

如果草稿有未保存修改，Studio 会禁用“合成音频”和“导出 MP4”，要求先保存并刷新预览。

## 后端配置

API key 只放在后端 `.env`，不要放前端代码或浏览器 localStorage。

```bash
WEB_VIDEO_SERVER_PORT=8787
WEB_VIDEO_RENDER_BASE_URL=http://127.0.0.1:5174
WEB_VIDEO_CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

WEB_VIDEO_TTS_PROVIDER=openai
WEB_VIDEO_TTS_VOICE=coral
OPENAI_API_KEY=sk-...
OPENAI_TTS_MODEL=gpt-4o-mini-tts
```

## TTS Provider

- `openai`: 后端读取 `OPENAI_API_KEY`，默认模型 `gpt-4o-mini-tts`。
- `edge-tts`: 本地命令，免费，无 API key，默认中文音色 `zh-CN-YunxiNeural`。它会访问 Microsoft TTS 服务，不是完全离线。
- `say`: macOS 离线合成，中文声音可用 `Tingting`，需要 `ffmpeg` 转 mp3。
- `piper`: 真本地模型路线，下载 Piper voice 后设置 `PIPER_BIN` 和 `PIPER_MODEL=/path/to/model.onnx`。

`edge-tts` 偶尔会返回 `NoAudioReceived`。默认会回退到 macOS `say`；如果不想回退，设置：

```bash
WEB_VIDEO_TTS_FALLBACK=none
```

## 本地生成音频

可以。最快的离线方案是 macOS `say`：

```bash
WEB_VIDEO_TTS_PROVIDER=say
WEB_VIDEO_TTS_VOICE=Tingting
```

更像“下载 TTS 模型到本地”的方案是 Piper：

```bash
WEB_VIDEO_TTS_PROVIDER=piper
PIPER_BIN=/path/to/piper
PIPER_MODEL=/path/to/voice.onnx
```

Piper 的中文音色质量取决于你下载的 voice。模型文件不提交到仓库，放在本机任意目录后用 `.env` 指向它即可。

## MP4 导出

Studio 的“导出 MP4”会发起后端 render job：

1. 后端用 Playwright 打开 `WEB_VIDEO_RENDER_BASE_URL/?project=<id>&renderStep=<n>`。
2. 每个 step 截一张 1920x1080 帧图。
3. 用音频真实时长或文字估算时长排列帧。
4. 用 `ffmpeg` 合成 `storage/projects/<id>/render/video.mp4`。

依赖：

- `playwright` Node 包
- 本机 Chrome，路径由 `WEB_VIDEO_CHROME_PATH` 指定
- `ffmpeg` 和 `ffprobe`

## API

- `GET /api/health`
- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects`
- `PUT /api/projects/:id`
- `POST /api/projects/:id/synthesize`
- `POST /api/projects/:id/render`

项目保存在 `storage/projects/<id>/`，包括：

- `project.json`
- `audio/<chapter>/<step>.mp3`
- `render/video.mp4`
