# AI Video Insight

AI Video Insight is a dual-service project built with Next.js and a Python FastAPI backend. It turns a video URL or local MP4 upload into a reusable analysis workspace with transcript-based summaries, multi-turn chat, request-driven memory, and PDF export.

## What It Does

- Analyze a video from a URL or uploaded MP4
- Fetch transcript context through pluggable transcript providers
- Generate structured results with title, summary, outline, and key points
- Support multi-turn Q&A against the current analysis
- Forward chat requests from Next.js to a Python AI backend
- Inject short-term memory, long-term analysis context, and compressed conversation summary into chat
- Export the current analysis and chat history as a downloadable PDF

## Tech Stack

- Next.js 16 App Router
- React 19
- Route Handlers for server APIs and download proxies
- Python FastAPI backend for chat orchestration, memory shaping, summarization, and PDF generation
- Supabase Auth + Postgres repository fallback
- Pluggable transcript provider layer
- Pluggable AI provider layer
- ReportLab for PDF generation

## Services

### Next.js App

- dashboard and analysis detail UI
- video analysis task orchestration
- transcript and AI summary pipeline
- Route Handlers for analysis, chat, auth, and PDF download proxy
- analysis repository backed by Supabase or in-memory fallback

### Python Backend

- `POST /api/chat/respond` for chat orchestration
- request-driven memory loading and conversation summary compression
- `POST /api/report/pdf` for PDF generation
- clean service boundaries for future real retrieval and summarization models

## Local Development

Run the two services in separate terminals.

### 1. Start Next.js

```bash
npm install
npm run dev
```

### 2. Start the Python backend

```bash
cd python-backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Environment

Add these items to [`.env.local`](/C:/Users/31744/Desktop/ai-video-insight/.env.local):

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

# Python backend
PYTHON_BACKEND_BASE_URL=http://127.0.0.1:8001
PYTHON_BACKEND_TIMEOUT_MS=20000

# Transcript provider
TRANSCRIPT_PROVIDER=mock
YT_DLP_BIN=yt-dlp
```

`PYTHON_BACKEND_BASE_URL` links the Next.js Route Handlers to the FastAPI backend for chat and PDF export.

## Chat, Memory, and PDF Flow

### Chat flow

1. The browser sends a follow-up message to `POST /api/analysis/[id]/chat`.
2. Next.js loads the analysis task and prepares:
   - summary
   - outline
   - key points
   - recent chat messages
   - request-driven memory items
3. Next.js forwards that payload to the Python backend at `POST /api/chat/respond`.
4. Python assembles short-term memory, long-term context, memory hits, and compressed conversation summary.
5. Python returns `answer`, `memory_hits`, `conversation_summary`, and normalized memory items.
6. Next.js appends the assistant reply to `chatMessages` and keeps extra runtime chat metadata available for future UI work.

### PDF flow

1. The analysis detail page calls `GET /api/analysis/[id]/report/pdf`.
2. Next.js loads the current analysis result and chat history.
3. Next.js sends a PDF payload to Python `POST /api/report/pdf`.
4. FastAPI generates a real PDF and streams it back.
5. The browser downloads the file.

## Architecture

```mermaid
flowchart LR
    User["User Browser"] --> UI["Next.js Frontend"]
    UI --> RH["Next.js Route Handlers"]

    RH --> Repo["Analysis Repository"]
    Repo --> SB["Supabase / In-Memory Fallback"]

    RH --> Transcript["Transcript Provider"]
    RH --> AI["AI Provider"]

    RH --> Py["Python FastAPI Backend"]
    Py --> Memory["Request-Driven Memory Loader"]
    Py --> Summary["Conversation Summarizer"]
    Py --> Pdf["PDF Report Service"]

    RH -->|"Chat payload: summary, outline, keyPoints, recent messages"| Py
    Memory -->|"memory items + memory hits"| Py
    Summary -->|"conversation summary"| Py
    Py -->|"answer + memory hits + conversation summary"| RH

    UI -->|"Export PDF"| RH
    RH -->|"report payload"| Py
    Pdf -->|"application/pdf"| RH
    RH -->|"download"| User
```

The app uses Next.js as the user-facing product layer and FastAPI as the backend orchestration layer for chat memory, conversation compression, and PDF generation.
