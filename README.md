# AI Video Insight

这是一个基于 Next.js 16.2.1 App Router 的视频分析应用。当前版本已经支持：

- 在 `/dashboard` 输入视频链接并创建分析任务
- 通过 Route Handlers 轮询任务状态
- 服务端抽取基础视频信息
- 通过可替换的 transcript provider 获取字幕或转写
- 调用可切换的 AI provider 生成结构化摘要
- 在同一视频上下文里继续追问
- 使用 Supabase 保存用户分析、通知和设置数据
- 使用 Supabase Auth 的 Google / GitHub OAuth 登录

## 技术说明

- 路由全部基于 App Router
- 公开 API 使用 Route Handlers
- 核心业务逻辑位于 `lib/analysis/*`
- 持久化存储使用 Supabase Postgres
- 认证使用 Supabase Auth OAuth
- transcript provider 和 AI provider 都支持 `mock` 回退

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000/dashboard](http://localhost:3000/dashboard)。

## 环境变量

在项目根目录创建 `.env.local`：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

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

## Supabase Setup

当前仓库已经接好了：

- Supabase Auth OAuth 登录
- Supabase Postgres 数据表结构
- 用户隔离的 analysis / notifications / settings 数据模型

你还需要完成以下步骤。

### 1. 创建 Supabase 项目

在 Supabase 控制台创建一个新项目，然后拿到：

- `Project URL`
- `Publishable key`
- `Service role key`

把它们填进 `.env.local`。

### 2. 执行数据库 SQL

打开 Supabase `SQL Editor`，执行：

- [supabase/schema.sql](C:\Users\31744\Desktop\ai-video-insight\supabase\schema.sql)

这会创建：

- `public.analysis_records`
- `public.user_notifications`
- `public.user_settings`
- 自动更新时间触发器
- RLS 策略

### 3. 打开 OAuth 登录

在 Supabase 控制台中确认：

1. `Authentication -> Providers -> Google` 已开启
2. `Authentication -> Providers -> GitHub` 已开启
3. `Authentication -> URL Configuration -> Site URL`
   本地建议填写：`http://localhost:3000`
4. `Authentication -> URL Configuration -> Redirect URLs`
   至少加入：`http://localhost:3000/auth/callback`

如果之后部署到 Vercel，也要加入正式域名的回调地址：

- `https://你的域名/auth/callback`

同时你还需要在 Google Developer Console 和 GitHub OAuth App 中，把回调地址也配置为同一个 `/auth/callback`。

### 4. 本地验证

```bash
npm run dev
```

然后访问：

- [http://localhost:3000/login](http://localhost:3000/login)

点击 Google 或 GitHub 登录后：

1. 页面跳转到对应的 OAuth provider
2. 授权完成后回到 `/auth/callback`
3. 项目自动交换 Supabase session
4. 跳回资料库或你原本要访问的受保护页面
5. 后续请求通过 cookie + refresh token 保持登录状态，直到用户登出或 session 失效

## 当前 Supabase 接入范围

目前代码已经使用 Supabase 的部分包括：

- [lib/supabase/client.ts](C:\Users\31744\Desktop\ai-video-insight\lib\supabase\client.ts)
- [lib/supabase/server.ts](C:\Users\31744\Desktop\ai-video-insight\lib\supabase\server.ts)
- [lib/supabase/admin.ts](C:\Users\31744\Desktop\ai-video-insight\lib\supabase\admin.ts)
- [app/auth/callback/route.ts](C:\Users\31744\Desktop\ai-video-insight\app\auth\callback\route.ts)
- [lib/auth/session.ts](C:\Users\31744\Desktop\ai-video-insight\lib\auth\session.ts)
- [lib/analysis/repository.ts](C:\Users\31744\Desktop\ai-video-insight\lib\analysis\repository.ts)
- [lib/notifications/repository.ts](C:\Users\31744\Desktop\ai-video-insight\lib\notifications\repository.ts)
- [lib/settings/repository.ts](C:\Users\31744\Desktop\ai-video-insight\lib\settings\repository.ts)

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

## API

- `POST /api/analyze`
  请求体：`{ "videoUrl": "https://..." }`
- `GET /api/analysis/[id]`
  返回任务当前状态、视频信息、分析结果和聊天消息
- `POST /api/analysis/[id]/chat`
  请求体：`{ "message": "..." }`

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
