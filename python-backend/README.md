# Python Backend

This folder contains a minimal FastAPI backend for the AI capabilities that will eventually power memory, retrieval, and PDF generation.

## What is included

- `FastAPI` application entrypoint
- `GET /api/health`
- `POST /api/chat/respond`
- Settings loaded from `.env`
- VS Code-friendly project structure

## Quick Start

1. Install Python 3.11 or 3.12 first.
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

## Test Endpoints

Open these URLs after startup:

- `http://127.0.0.1:8001/`
- `http://127.0.0.1:8001/docs`
- `http://127.0.0.1:8001/api/health`

Example request:

```powershell
curl.exe -X POST "http://127.0.0.1:8001/api/chat/respond" `
  -H "Content-Type: application/json" `
  -d "{\"message\":\"hello backend\",\"recent_messages\":[]}"
```
