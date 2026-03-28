# 视频分析 MVP

这是一个基于 Next.js 16.2.1 App Router 的视频分析 MVP。当前版本已经支持：

- 在 `/dashboard` 输入视频链接并创建分析任务
- 通过 Route Handlers 轮询任务状态
- 服务端抽取基础视频信息
- 通过可替换的 transcript provider 获取字幕/转写
- 调用可切换的 AI provider 生成结构化摘要
- 基于同一份视频上下文继续追问

## 技术说明

- 路由全部基于 App Router
- 公开 API 使用 Route Handlers
- 核心业务逻辑位于 `lib/analysis/*`
- 当前仓储为内存实现，便于本地跑通 MVP
- 默认 transcript provider 和 AI provider 都支持 `mock` 回退

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000/dashboard](http://localhost:3000/dashboard)。

## 环境变量

在项目根目录创建 `.env.local`：

```bash
# AI provider
AI_PROVIDER=mock
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
AI_TIMEOUT_MS=25000

# Transcript provider
TRANSCRIPT_PROVIDER=mock
YT_DLP_BIN=yt-dlp
# YTDLP_COOKIES_PATH=
# YTDLP_COOKIES_FROM_BROWSER=
# TRANSCRIPT_UPLOAD_TIMEOUT_MS=300000

# Optional: make local processing state easier to observe
ANALYSIS_MOCK_DELAY_MS=1200
```

## Deploying To Vercel

This project supports page-style video URLs on Vercel as well as local development:

- Local development uses `.\.tools\yt-dlp.exe` on Windows.
- Vercel installs a Linux `yt-dlp` binary during `postinstall` to `bin/yt-dlp`.
- Server-side temporary media files are written to `/tmp` on Vercel and `.tmp/transcript-media` locally.
- The `yt-dlp` binary is explicitly included in the server trace for the analysis API routes via `outputFileTracingIncludes`.

Recommended Vercel environment variables:

```bash
AI_PROVIDER=http
AI_BASE_URL=https://api.moonshot.cn/v1
AI_API_KEY=...
AI_MODEL=moonshot-v1-32k

TRANSCRIPT_PROVIDER=assemblyai
TRANSCRIPT_API_KEY=...
ASSEMBLYAI_BASE_URL=https://api.assemblyai.com
ASSEMBLYAI_SPEECH_MODELS=universal-3-pro,universal-2
TRANSCRIPT_TIMEOUT_MS=120000
TRANSCRIPT_UPLOAD_TIMEOUT_MS=300000
```

Notes:

- Most direct media URLs and many Bilibili / YouTube page URLs should work after deployment.
- Some videos may still require cookies, login, region access, or may block automated downloads.
- The current implementation is suitable for low to moderate traffic. For heavier workloads, move media extraction into a dedicated worker or container service.

### 变量说明

- `AI_PROVIDER`
  - 可选值：`mock`、`http`
  - 未显式配置时，如果 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 都存在，则自动使用 `http`，否则回退到 `mock`
- `AI_BASE_URL`
  - 当前 `http` provider 采用 OpenAI-compatible Chat Completions 协议
  - 可以传基础地址，例如 `https://api.openai.com/v1`
  - 也可以直接传完整地址，例如 `https://api.openai.com/v1/chat/completions`
- `AI_API_KEY`
  - 服务端访问第三方 AI API 的密钥，只会在服务端读取
- `AI_MODEL`
  - 第三方 AI 模型名
- `AI_TIMEOUT_MS`
  - AI 请求超时时间，默认 `25000`
- `TRANSCRIPT_PROVIDER`
- `ANALYSIS_MOCK_DELAY_MS`
  - 可选。用于本地演示时延长 mock transcript 的处理时间，方便看到 `processing` 状态

## API

- `POST /api/analyze`
  - 请求体：`{ "videoUrl": "https://..." }`
  - 返回：分析任务对象
- `GET /api/analysis/[id]`
  - 返回：任务当前状态、视频信息、分析结果、聊天消息
- `POST /api/analysis/[id]/chat`
  - 请求体：`{ "message": "..." }`
  - 返回：更新后的任务对象

## 当前实现细节

- AI 输出被要求返回严格 JSON：

```json
{
  "title": "string",
  "summary": "string",
  "outline": [{ "time": "MM:SS", "text": "string" }],
  "keyPoints": ["string"],
  "suggestedQuestions": ["string"]
}
```


## 目录概览

```text
app/api/*                    # Route Handlers
app/dashboard/page.tsx       # dashboard 入口
components/dashboard/*       # dashboard 客户端状态流
components/VideoSection.tsx  # 左侧视频与提交区域
components/AiPanel.tsx       # 右侧摘要 / 大纲 / 聊天面板
lib/ai/prompts.ts            # AI prompt
lib/analysis/*               # 类型、provider、repository、service
```
