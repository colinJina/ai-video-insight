# Python Backend

This folder contains a small but complete FastAPI service for AI Video Insight.
It currently focuses on three backend capabilities:

- health checks
- video-context chat orchestration
- basic PDF report export

The goal is to keep the service easy to explain, easy to extend, and ready for future LangChain or custom retrieval integration without introducing heavy infrastructure too early.

## Current Engineering Features

- typed request and response models with Pydantic
- centralized settings loading from `.env`
- structured application logging
- unified exception handling with consistent JSON error responses
- modular service layer for chat, memory hooks, and PDF generation
- switchable model adapter layer for direct HTTP or LangChain-backed model calls

## Project Structure

```text
app/
  api/
    routes/
      chat.py           # Chat endpoint
      health.py         # Health endpoint
      report.py         # PDF export endpoint
    router.py           # API router composition
  core/
    config.py           # Centralized settings
    exceptions.py       # Shared error and exception handlers
    logging.py          # Logging bootstrap
  models/
    chat.py             # Chat request/response and internal models
    health.py           # Health response model
    report.py           # PDF report request model
  services/
    chat.py             # Chat workflow coordinator
    chat_context.py     # Context assembly
    chat_generation.py  # Placeholder answer generation
    chat_memory.py      # Request-driven memory loader
    chat_model.py       # Future LangChain / LLM gateway hook
    chat_validation.py  # Input validation and normalization
    report_pdf.py       # PDF generation service
  main.py               # FastAPI app bootstrap
```

## Quick Start

1. Install Python 3.11 or 3.12.
2. Open a terminal in the project root.
3. Create a virtual environment:

```powershell
cd python-backend
python -m venv .venv
```

4. Activate it:

```powershell
.venv\Scripts\Activate.ps1
```

5. Install dependencies:

```powershell
pip install -r requirements.txt
```

6. Copy environment variables:

```powershell
Copy-Item .env.example .env
```

7. Start the server:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

## Tests

The backend uses `pytest` for lightweight unit testing.

Run the test suite from `python-backend/`:

```powershell
python -m pytest
```

Run a single test file:

```powershell
python -m pytest tests\test_chat_model_gateway.py
```

## Environment Variables

These settings are loaded from `.env` through `app/core/config.py`.

```bash
APP_NAME=AI Video Insight Python Backend
APP_ENV=development
APP_HOST=127.0.0.1
APP_PORT=8001
APP_VERSION=0.1.0
ALLOWED_ORIGINS=http://localhost:3000
LOG_LEVEL=INFO
CHAT_PROVIDER=stub
LANGCHAIN_ENABLED=false
CHAT_MODEL_ADAPTER=http
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
AI_TIMEOUT_MS=25000
```

Notes:

- `LOG_LEVEL` controls application logging verbosity.
- `CHAT_PROVIDER` is a simple label exposed by the root endpoint so you can show which chat backend is active.
- `CHAT_MODEL_ADAPTER` accepts `http` or `langchain`. If omitted, the backend falls back to `LANGCHAIN_ENABLED=true` and otherwise uses `http`.
- The LangChain adapter reuses the same `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, and `AI_TIMEOUT_MS` settings as the direct HTTP adapter.

## API Overview

After startup, these URLs should be available:

- `http://127.0.0.1:8001/`
- `http://127.0.0.1:8001/docs`
- `http://127.0.0.1:8001/api/health`

### `GET /api/health`

Returns service health metadata.

Example response:

```json
{
  "status": "ok",
  "service": "AI Video Insight Python Backend",
  "environment": "development"
}
```

### `POST /api/chat/respond`

Accepts structured video-analysis chat context and returns a deterministic placeholder answer.

Current context assembly includes:

- recent messages
- analysis summary
- transcript excerpt
- request-driven memory items

Example request:

```json
{
  "userId": "user_123",
  "analysisId": "analysis_456",
  "analysisSummary": "This video explains retrieval-augmented generation.",
  "transcriptExcerpt": "Chunking and retrieval quality are closely related.",
  "message": "How does chunking affect retrieval?",
  "recentMessages": [
    {
      "role": "user",
      "content": "What is this video about?"
    },
    {
      "role": "assistant",
      "content": "It is about retrieval-augmented generation."
    }
  ],
  "memoryItems": [
    {
      "kind": "summary",
      "content": "The speaker emphasizes grounding answers in retrieved context.",
      "source": "analysis.summary",
      "metadata": {
        "priority": 1
      }
    }
  ]
}
```

### `POST /api/report/pdf`

Generates a basic PDF report and returns it as `application/pdf`.

Included content:

- title
- summary
- key points
- outline
- chat history

Example request:

```json
{
  "title": "RAG Basics",
  "summary": "This video explains the core retrieval-augmented generation workflow.",
  "keyPoints": [
    "Chunking changes retrieval quality.",
    "Grounded answers depend on useful context."
  ],
  "outline": [
    {
      "time": "00:12",
      "text": "Introduction to retrieval-augmented generation"
    }
  ],
  "chatHistory": [
    {
      "role": "user",
      "content": "What is the main point of this video?"
    },
    {
      "role": "assistant",
      "content": "It explains how retrieval improves answer grounding."
    }
  ]
}
```

## Error Handling

The service now uses centralized exception handling.

Common behavior:

- request validation errors return HTTP `422`
- known service errors return a structured JSON error payload
- unexpected exceptions are logged and return HTTP `500`

Error shape:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "message cannot be blank after trimming whitespace"
  }
}
```

## Logging

The backend now includes lightweight request logging.

Current logging behavior:

- logs incoming requests
- logs completed requests with status code
- logs unhandled exceptions with stack trace

This is intentionally minimal, but it is enough to demonstrate that the service is observable and debuggable.

## LangChain Adapter Layer

The files [app/services/chat_model.py](/C:/Users/31744/Desktop/ai-video-insight/python-backend/app/services/chat_model.py) and [app/services/chat_langchain_adapter.py](/C:/Users/31744/Desktop/ai-video-insight/python-backend/app/services/chat_langchain_adapter.py) now provide a switchable model adapter layer.

Current behavior:

1. `ChatService` still calls `ChatModelGateway` for answer generation, summary compression, and memory extraction.
2. `ChatModelGateway` selects either the direct `http` path or the `langchain` adapter from configuration.
3. Request validation, memory loading, context assembly, and response shaping stay unchanged.

This keeps the integration story simple:

- input validation stays separate
- memory loading stays replaceable
- context building stays deterministic
- model invocation stays isolated behind one gateway
- LangChain can be introduced without rewriting the chat pipeline
