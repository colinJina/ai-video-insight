# AI Video Insight MCP Server

This folder contains a local stdio MCP server for AI Video Insight. It exposes the project's video-analysis workspaces as MCP resources, tools, and prompts so external agents can inspect summaries, search transcript evidence, read memory, and prepare grounded answers.

## Requirements

Set these environment variables before starting the server:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

Optional but recommended:

```powershell
$env:MCP_DEFAULT_USER_ID="00000000-0000-0000-0000-000000000000"
```

`MCP_DEFAULT_USER_ID` scopes read operations to one Supabase user when a tool call does not pass `userId`.

## Run

```powershell
npm run mcp:server
```

MCP clients should start this command as a stdio server. The server writes status logs to stderr so stdout stays reserved for MCP protocol messages.

## Client Config Example

```json
{
  "mcpServers": {
    "ai-video-insight": {
      "command": "node",
      "args": [
        "C:\\Users\\31744\\.codex\\worktrees\\1f74\\ai-video-insight\\mcp-server\\index.mjs"
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

## Resources

- `analysis://{analysisId}/summary`
- `analysis://{analysisId}/outline`
- `analysis://{analysisId}/transcript`
- `analysis://{analysisId}/memory`
- `analysis://{analysisId}/chat-history`

## Tools

- `list_analyses`: list recent analysis workspaces.
- `get_analysis_context`: fetch summary, outline, recent chat, and optional transcript excerpt.
- `search_transcript`: search transcript chunks for evidence snippets.
- `get_memory`: read persisted memory and rolling conversation summary.
- `save_memory_note`: save one bounded `manual_note` memory item.
- `export_report_payload`: build a report-ready JSON payload.

## Prompts

- `answer_video_question`: answer from analysis context and transcript evidence.
- `verify_grounding`: check answer support against evidence.
- `prepare_interview_brief`: turn an analysis into an interview preparation brief.

## Suggested Workflow

1. Call `list_analyses`.
2. Pick an `analysisId`.
3. Call `get_analysis_context`.
4. Call `search_transcript` with the user's question.
5. Use `answer_video_question` or `verify_grounding` with the returned context and evidence.

## Safety Notes

The MVP server is intentionally read-mostly. The only write tool is `save_memory_note`, and it stores notes as `manual_note` items in `memory_store`.
