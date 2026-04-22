<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This repo uses Next.js 16 and React 19. APIs, conventions, and file structure may differ from older Next.js versions. Read the relevant guide in `node_modules/next/dist/docs/` before changing framework code, and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AI Agent Repository Guide

Use this file as the first project-specific grounding document for Codex or any other LLM agent working in this repo.

If this file conflicts with the source code, trust the code and update this file.

## Verified Project Snapshot

- Project name: `AI Video Insight`
- Product shape in code: a dual-service video analysis workspace
- Frontend: Next.js App Router UI plus Route Handlers
- Backend: Python FastAPI service for chat orchestration and PDF generation
- Auth and storage: Supabase Auth + Postgres, with repository fallbacks in some paths
- Input types implemented in code:
  - public video URL
  - local MP4 upload
- Output types already implemented in code:
  - structured title
  - summary
  - outline with timestamps when available
  - key points
  - suggested follow-up questions
  - multi-turn AI chat
  - transcript evidence citations on chat replies
  - PDF export
  - notifications
  - library and archive views

## Do Not Invent

- Do not invent business goals, target users, roadmap, interview framing, or unsupported providers. Ask the user if those are needed.
- Treat `keyPoints` as the verified structured output. Do not claim there is a separate end-user keyword extraction feature unless the user says so.
- Treat `mock` transcript output as fallback or demo behavior, not as grounded real-video analysis.
- Uploaded MP4 files are written to temp storage:
  - local: `.tmp/uploaded-videos`
  - Vercel: `/tmp/uploaded-videos`
  This is not durable media storage.
- If the user asks for a project brief, portfolio write-up, or interview story, separate:
  - verified-from-code facts
  - user-provided product narrative

## What To Read First

Read these files before making architecture claims or changing the core flow:

- `app/api/analyze/route.ts`
- `lib/analysis/services/tasks.ts`
- `lib/analysis/services/processing.ts`
- `lib/analysis/services/chat.ts`
- `app/api/analysis/[id]/chat/route.ts`
- `lib/python-backend/client.ts`
- `python-backend/app/api/routes/chat.py`
- `python-backend/app/services/chat.py`
- `python-backend/app/services/chat_langgraph_adapter.py`
- `supabase/schema.sql`

## Learning-State Adaptation

When the user asks:
- what to learn for a feature
- how a current flow works
- which parts require implementation practice
- how to explain a feature in interviews

you must first read:

- `docs/user-learning-state.md`

Then adapt the answer to the latest documented learning state.

Rules:
- Prefer the latest learning-state document over older assumptions.
- Do not repeat outdated statements about what the user already knows.
- If the user has progressed on a topic, reduce beginner explanation and increase implementation detail, trade-offs, and interview follow-up depth.
- If the learning-state file is missing, state that the skill-level assumptions are inferred rather than confirmed.

## Repo Map

- `app/`
  - App Router pages and Route Handlers
  - user-facing pages such as `dashboard`, `analysis/[id]`, `library`, `archive`, `notifications`, `settings`, `login`
- `components/`
  - reusable UI building blocks
  - dashboard input flow, AI panels, analysis conversation UI, library cards, settings forms
- `lib/analysis/`
  - main domain layer for analysis creation, processing, retrieval, repositories, providers, result shaping, and SSE helpers
- `lib/python-backend/`
  - Next.js-side client for calling FastAPI chat and PDF endpoints
- `lib/supabase/`
  - Supabase clients, typed database bindings, auth helpers, repository glue
- `python-backend/app/`
  - FastAPI app, request models, service layer, model adapters, memory logic, PDF generation
- `supabase/schema.sql`
  - source of truth for persisted tables, RLS, RPC functions, vector search, and job coordination

## Main Analysis Flow

This is the verified high-level flow for URL analysis and MP4 upload:

1. The dashboard submits either:
   - JSON with `videoUrl`
   - multipart form data with `videoFile`
2. `POST /api/analyze` requires an authenticated app session.
3. `createAnalysisTask()` resolves video metadata:
   - URL path: `extractVideoMetadata(...)`
   - upload path: persist temp file first, then `extractUploadedVideoMetadata(...)`
4. A new analysis record is created with:
   - status `queued`
   - transcript `null`
   - result `null`
   - empty chat history
5. If the user is Supabase-backed, an `analysis_jobs` row is enqueued and processing runs through the job layer.
6. Processing stages in `processAnalysisTask()` are:
   - `transcript`
   - `summary`
   - `indexing`
7. Transcript stage uses the configured transcript provider.
8. Summary stage uses the configured AI provider and normalizes output into:
   - `title`
   - `summary`
   - `outline`
   - `keyPoints`
   - `suggestedQuestions`
9. Indexing stage chunks transcript segments and stores embeddings when an embedding provider is configured.
10. On success:
   - analysis status becomes `completed`
   - a completion notification is created
11. On failure:
   - the job may retry
   - the analysis may return to `queued` or end in `failed`
   - a failure notification is created when retries are exhausted

## Async and State Flow

There are two related state models in the code:

- Analysis record status:
  - `queued`
  - `processing`
  - `completed`
  - `failed`
- Analysis job stage:
  - `queued`
  - `transcript`
  - `summary`
  - `indexing`
  - `completed`
  - `failed`

Other verified async behavior:

- The dashboard polls `GET /api/analysis/[id]` every 1500 ms while analysis is still running.
- Background work is coordinated through `analysis_jobs` rows plus in-process task execution and heartbeat leasing.
- Checkpoints are stored in `agent_checkpoints` so transcript and summary work can be restored if needed.
- Chat replies are streamed over SSE from the Python backend and then re-streamed by Next.js to the browser.

## Chat Flow

This is the verified chat chain for `POST /api/analysis/[id]/chat`:

1. Next.js loads the analysis and ensures it is already `completed`.
2. Chat state is resolved from `memory_store`, with migration support from legacy `result.chatState`.
3. The latest user message is normalized and appended to recent messages.
4. Next.js builds chat context from:
   - analysis summary
   - outline
   - key points
   - recent messages
   - stored conversation summary
   - stored memory items
5. Transcript retrieval happens before the Python call:
   - dense search from embeddings when configured
   - sparse text search
   - weighted fusion
   - optional neighbor expansion
6. Retrieved transcript chunks become:
   - transcript excerpt
   - request memory items
   - user-visible citations
7. Next.js sends the final chat payload to FastAPI.
8. FastAPI returns streamed tokens and a final structured payload.
9. Next.js persists:
   - the assistant reply
   - updated conversation summary
   - updated durable memory items
10. The browser receives:
   - streaming text
   - final updated analysis payload
   - citations for the latest reply

## Python Backend Responsibilities

The Python service is not the primary source of truth for the analysis record. It currently focuses on:

- chat request validation and normalization
- chat context assembly support
- model adapter selection
- LangGraph-backed tool-style answering path
- memory shaping and memory updates
- conversation summary compression
- PDF report generation

In this repo, Next.js still owns:

- analysis record lifecycle
- transcript acquisition
- structured summary generation
- transcript chunk indexing
- persistence of final chat history and memory state

## Storage and Persistence

The following persisted structures are verified in `supabase/schema.sql`:

- `analysis_records`
  - main record for video metadata, transcript, structured result, chat history, status, errors, and archive state
- `analysis_transcript_chunks`
  - transcript chunks plus vector embeddings for retrieval
- `analysis_jobs`
  - queue and lease state for background analysis processing
- `agent_checkpoints`
  - stage-level checkpointing for retry and recovery
- `memory_store`
  - durable conversation summary and memory items per analysis
- `user_notifications`
  - completion and failure notifications
- `user_settings`
  - profile and preference state

Important interpretation notes:

- transcript chunks are retrieval infrastructure, not a separate end-user feature
- memory store is the durable home for chat summary and memory items
- `analysis_records.result.chatState` exists, but current code prefers `memory_store` as the persisted source

## UI Surface Area

These user-facing areas exist in code and can be referenced safely:

- `dashboard`
  - start a new analysis from URL or MP4 upload
- `analysis/[id]`
  - read the summary, outline, current status, transcript source, export PDF, and continue the conversation
- `library`
  - browse active analyses
- `archive`
  - browse archived analyses
- `notifications`
  - read analysis-related notifications
- `settings`
  - manage user settings

## When Writing Docs For The User

If the user asks for a project description, project spec, README rewrite, portfolio entry, or interview script:

1. Reuse the verified architecture and data flow from this file.
2. Ask the user for the human-only context that code cannot answer reliably:
   - project goal
   - target user
   - completed vs planned features
   - what to emphasize in interviews
3. Clearly label anything inferred from code.
4. Do not silently upgrade a prototype, fallback, or mock path into a production claim.

## Safe Claims vs User-Required Claims

Safe claims from code:

- the app analyzes videos from a URL or MP4 upload
- the app stores analysis records and chat history
- the app supports transcript-based summaries and follow-up chat
- the app uses retrieval over transcript chunks for grounded chat context
- the app uses a Python backend for chat orchestration and PDF generation

Claims that still require user confirmation:

- why the project was built
- who the target audience is
- whether a provider is production-ready
- which unfinished features should be described as roadmap
- which engineering choices should be highlighted in interviews
