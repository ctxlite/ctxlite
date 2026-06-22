# Architecture

## Overview

ctxlite has two components running in a single process:

### 1. HTTP Proxy (`internal/proxy`)

Intercepts LLM API calls from tools that support HTTP proxy configuration (Cursor, Claude Code).  
Forwards requests to any provider using pass-through from the `Host` header.

**Request lifecycle:**

```
Request in
  → extract body (strip auth headers from cache keys only)
  → L1 cache lookup (SHA256 exact match)
    → HIT: return cached response
  → L2 cache lookup (cosine similarity via sqlite-vec)
    → HIT (>= 0.92): return cached response
  → context trimmer (BM25 relevance scoring)
  → forward trimmed request to upstream API
  → cache response
  → return to client
```

## HTTP Proxy — pass-through pur

The proxy forwards requests to the original upstream with no provider detection logic.  
Upstream is determined exclusively from the request `Host` header.

```
Cursor / Claude Code
       ↓ (OPENAI_BASE_URL or ANTHROPIC_BASE_URL → 127.0.0.1:8080)
  ctxlite proxy :8080
       ↓ Host header: api.anthropic.com (or other provider)
  L1 cache → HIT → return
       ↓ MISS
  L2 cache → HIT → return
       ↓ MISS
  context trimmer
       ↓
  api.anthropic.com (or original Host)
```

### Why pass-through instead of upstream detection

Coding tools support dozens of providers (Anthropic, OpenAI, Groq, Ollama, Azure, Bedrock, GitHub Copilot, etc.), each with its own URL. Any detection logic would be incomplete and break on new providers.

Pure pass-through works with any provider, now and in the future, without changes to ctxlite.

### Localhost exception

Requests to `localhost` or `127.0.0.1` are proxied with `http://` instead of `https://` — for Ollama, LM Studio, and other local servers.

### 2. MCP Server (`internal/mcp`)

Exposes tools to Cursor, OpenCode and Claude Code via stdio transport.

**Tools:**

- `trim_context` — explicitly trim a list of files to the most relevant ones
- `get_stats` — return current session statistics

## MCP Server — compatible with any tool

The MCP server works independently of the proxy.  
OpenCode and any other MCP-capable tool benefit from:

- `trim_context` — explicit file trimming
- `get_stats` — session statistics

## Data flow

```
[Client Tool] → HTTP → [proxy.go] → [cache/exact.go] → HIT → [Client Tool]
                                  ↓ MISS
                             [cache/semantic.go] → HIT → [Client Tool]
                                  ↓ MISS
                             [trimmer/bm25.go]
                                  ↓
                             [Upstream API]
                                  ↓
                             [stats/stats.go] (log request)
                                  ↓
                             [Client Tool]
```

## Security model

- Proxy binds on `127.0.0.1` only — not accessible from network
- API keys are forwarded per-request and never stored
- Cache keys are derived from request body only (no auth headers)
- SQLite database is stored in `~/.ctxlite/` with user-only permissions
