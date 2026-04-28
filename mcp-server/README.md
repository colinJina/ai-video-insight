# AI Video Insight MCP Server

This folder contains the MCP server for AI Video Insight. It exposes video-analysis workspaces as MCP resources, tools, and prompts so external agents can inspect summaries, search transcript evidence, read memory, and prepare grounded answers.

The server now supports two transports:

- `stdio`: local process-spawned MCP clients.
- `Streamable HTTP`: remote MCP clients over `/mcp`, with Supabase Bearer-token authentication.

## Required Environment

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

For local stdio only, set a default user scope:

```powershell
$env:MCP_DEFAULT_USER_ID="00000000-0000-0000-0000-000000000000"
```

For Streamable HTTP:

```powershell
$env:MCP_HTTP_HOST="127.0.0.1"
$env:MCP_HTTP_PORT="3333"
```

Use `MCP_ALLOWED_HOSTS` when binding to a public host, for example:

```powershell
$env:MCP_HTTP_HOST="0.0.0.0"
$env:MCP_ALLOWED_HOSTS="mcp.example.com,localhost"
```

## Run Locally

Stdio mode:

```powershell
npm run mcp:server
```

Streamable HTTP mode:

```powershell
npm run mcp:http
```

The MCP endpoint is:

```text
http://127.0.0.1:3333/mcp
```

Health check:

```text
http://127.0.0.1:3333/health
```

## Authentication

Streamable HTTP requires a Supabase user access token:

```http
Authorization: Bearer <supabase-user-access-token>
```

The server verifies the token with Supabase, extracts the authenticated `user_id`, and scopes every tool/resource read or write to that user. The `userId` tool argument is kept only as a local stdio fallback. In HTTP mode, if a caller passes a different `userId`, the request is rejected.

For temporary local debugging only:

```powershell
$env:MCP_HTTP_AUTH_DISABLED="true"
```

Do not deploy with auth disabled.

## Client Config Example

For a Streamable HTTP-capable MCP client, configure the URL and Bearer token:

```json
{
  "mcpServers": {
    "ai-video-insight": {
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <supabase-user-access-token>"
      }
    }
  }
}
```

For local stdio clients:

```json
{
  "mcpServers": {
    "ai-video-insight": {
      "command": "node",
      "args": [
        "C:\\Users\\31744\\Desktop\\ai-video-insight\\mcp-server\\index.mjs"
      ],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key",
        "MCP_DEFAULT_USER_ID": "00000000-0000-0000-0000-000000000000"
      }
    }
  }
}
```

## Deploy

Deploy the MCP server as a long-running Node.js service because the stateful Streamable HTTP transport keeps MCP sessions in memory.

Docker build from the repo root:

```powershell
docker build -f mcp-server/Dockerfile -t ai-video-insight-mcp .
```

Run:

```powershell
docker run --rm -p 3333:3333 `
  -e MCP_HTTP_HOST=0.0.0.0 `
  -e MCP_HTTP_PORT=3333 `
  -e MCP_ALLOWED_HOSTS=mcp.example.com,localhost `
  -e NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co `
  -e SUPABASE_SERVICE_ROLE_KEY=your-service-role-key `
  ai-video-insight-mcp
```

Good deployment targets: Render, Railway, Fly.io, a VM, or any container host with a persistent Node process. Vercel serverless functions are not the best fit for this stateful in-memory session mode.

## Resources

- `analysis://{analysisId}/summary`
- `analysis://{analysisId}/outline`
- `analysis://{analysisId}/transcript`
- `analysis://{analysisId}/memory`
- `analysis://{analysisId}/chat-history`

## Tools

- `list_analyses`: list recent analysis workspaces for the authenticated user.
- `get_analysis_context`: fetch summary, outline, recent chat, and optional transcript excerpt.
- `search_transcript`: search transcript chunks for evidence snippets.
- `get_memory`: read persisted memory and rolling conversation summary.
- `save_memory_note`: save one bounded `manual_note` memory item.
- `export_report_payload`: build a report-ready JSON payload.

## Prompts

- `answer_video_question`: answer from analysis context and transcript evidence.
- `verify_grounding`: check answer support against evidence.
- `prepare_interview_brief`: turn an analysis into an interview preparation brief.

## Learning Notes

- MCP: Model Context Protocol. It is a standard way for an AI client to discover and call your app's tools, resources, and prompts.
- Transport: the wire/channel used by MCP messages. `stdio` means the client starts a local process and talks through standard input/output. `Streamable HTTP` means the client talks to a URL with HTTP requests and optional streaming responses.
- Bearer token: a credential in the `Authorization` header. Whoever presents a valid token is treated as the authenticated user.
- Supabase access token: the JWT Supabase gives a logged-in user. This server verifies it and uses the token's user id for isolation.
- Multi-user isolation: every database query includes `user_id = authenticated_user_id`, so one user's MCP client cannot read or write another user's analyses.
- Session: a Streamable HTTP conversation identified by `mcp-session-id`. This server binds each session to the user who initialized it.
- Service role key: a privileged Supabase key used only on the server side to verify tokens and query scoped data. Never expose it to browsers or MCP clients.
- Deployment: running the MCP server somewhere reachable by clients, with environment variables, HTTPS, health checks, and logs.
