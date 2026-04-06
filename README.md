# AI Video Insight

AI Video Insight is a Next.js 16 App Router project for turning a video URL or local MP4 upload into a reusable analysis workspace.

Current capabilities:

- Create an analysis task from `/dashboard`
- Poll task status through Route Handlers
- Extract basic video metadata on the server
- Fetch transcript data through pluggable transcript providers
- Generate structured summaries through pluggable AI providers
- Continue asking follow-up questions within the same video context
- Store analysis records, notifications, and user settings in Supabase
- Authenticate with Supabase Auth using Google or GitHub OAuth

## Tech Stack

- Next.js 16 App Router
- React 19
- Supabase Auth + Postgres
- Route Handlers for server APIs
- Pluggable transcript and AI provider layers with mock fallbacks

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Environment Variables

Create `.env.local` in the project root:

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

1. Create a Supabase project and collect:
   - `Project URL`
   - `Publishable key`
   - `Service role key`
2. Put those values into `.env.local`.
3. Run [supabase/schema.sql](/C:/Users/31744/Desktop/ai-video-insight/supabase/schema.sql) in the Supabase SQL Editor.
4. Enable Google and GitHub providers in Supabase Auth.
5. Configure `http://localhost:3000/auth/callback` as a redirect URL for local development.

## Deploying To Vercel

This project supports page-style video URLs on Vercel as well as local development:

- Local development uses `.\.tools\yt-dlp.exe` on Windows.
- Vercel installs a Linux `yt-dlp` binary during `postinstall` to `bin/yt-dlp`.
- Server-side temporary media files are written to `/tmp` on Vercel and `.tmp/transcript-media` locally.
- The `yt-dlp` binary is included in the server trace for the analysis routes through `outputFileTracingIncludes`.

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

## API

- `POST /api/analyze`
  - Body: `{ "videoUrl": "https://..." }`
- `GET /api/analysis/[id]`
  - Returns task status, video metadata, analysis result, and chat messages
- `POST /api/analysis/[id]/chat`
  - Body: `{ "message": "..." }`

## Project Layout

```text
app/api/*                    # Route Handlers
app/dashboard/page.tsx       # Dashboard entry
components/dashboard/*       # Client-side dashboard state
components/VideoSection.tsx  # Left-side video and submit area
components/AiPanel.tsx       # Right-side summary / outline / chat panel
lib/ai/prompts.ts            # Prompt builders
lib/analysis/*               # Analysis domain types, providers, repository, services
```
