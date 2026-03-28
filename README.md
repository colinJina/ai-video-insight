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

# Optional: make local processing state easier to observe
ANALYSIS_MOCK_DELAY_MS=1200
```

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
  - 当前仅实现 `mock`
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

- 服务端会对模型输出做解析和兜底校验，避免异常响应直接打崩页面
- 聊天接口与摘要接口共用同一套视频上下文
- `/dashboard` 右侧面板已经从 mock 文案切换为真实状态流

## 已知限制

- 当前 repository 是内存实现，服务重启后任务会丢失
  - 下一步应替换为 Postgres / Supabase / Neon 之类的持久化存储
- 当前 transcript provider 默认是 `mock`
  - 也就是说，如果还没接入真实字幕/ASR，摘要结果仍然是基于 mock transcript 生成
- 页面内视频预览目前只支持浏览器可直接播放的媒体地址，例如 `.mp4`、`.webm`
  - 对于 YouTube、Bilibili 等网页链接，当前版本仍可分析，但不会在左侧播放器内直接预览

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
