# Configuration

## CLI flags

| Flag | Default | Description |
|------|---------|-------------|
| `--config` | `~/.ctxlite/config.yaml` | Config file path |
| `--port` | `8080` | HTTP proxy port |
| `--db` | `~/.ctxlite/cache.db` | SQLite database path |
| `--verbose` | `false` | Enable debug logging |
| `--version` | — | Print version and exit |
| `--upstream-url` | — | Force all traffic to one URL (testing only). Default: pass-through from `Host` header |
| `--max-context` | `4096` | Max tokens kept in trimmed file context |

The HTTP proxy resolves upstream from the request `Host` header. Tools must send the original provider host (e.g. `api.anthropic.com`) when connecting via `OPENAI_BASE_URL` or `ANTHROPIC_BASE_URL`.

### Embedding provider (L2 semantic cache)

| Flag | Default | Description |
|------|---------|-------------|
| `--embedding-url` | — | OpenAI-compatible embeddings API base URL |
| `--embedding-key` | — | API key for the embedding provider |
| `--embedding-model` | `text-embedding-3-small` | Embedding model name |

If no embedding provider is configured, L2 semantic cache is disabled and L1 exact cache still works.  
Set `OPENAI_API_KEY` to enable L2 with the OpenAI embeddings API automatically.

## Config file

Default location: `~/.ctxlite/config.yaml`

Override path:

```bash
ctxlite --config /path/to/config.yaml
```

**Priority order** (highest wins):

1. CLI flags
2. Config file
3. Built-in defaults

**Full example** — `~/.ctxlite/config.yaml`:

```yaml
port: 8080
db: ~/.ctxlite/cache.db
verbose: false

embedding:
  url: http://localhost:11434
  model: nomic-embed-text

trimming:
  max_context_tokens: 8192
  import_graph: true

cache:
  ttl: 48h
  semantic_threshold: 0.90
  max_entries: 20000
```

A missing config file is not an error — ctxlite starts with defaults.

## Environment variables (tool setup)

### Cursor

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8080/v1
```

Cursor sends requests to the local proxy with the original provider in the `Host` header.

### Claude Code

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8080
```

### OpenCode

#### Install

```bash
opencode plugin @ctxlite/opencode -g -f
```

#### What it does

**Automatic (zero config):**

- Injects conciseness instructions into the system prompt
- The model avoids filler phrases, recaps, and verbose sign-offs

**On demand (tool calls):**

- `get_stats` — token savings statistics
- `trim_context` — explicit file trimming

#### Stats

In any OpenCode session:

```
> ctxlite stats
> ctxlite stats 7d
```

#### Note on automatic trimming

OpenCode does not expose the messages array as mutable in plugin hooks.  
Automatic BM25 context trimming is not possible through the plugin API.  
Use the `trim_context` tool explicitly before large tasks.

#### MCP (Cursor)

For Cursor, use the MCP server instead:

```json
{
  "mcpServers": {
    "ctxlite": { "type": "stdio", "command": "npx", "args": ["-y", "@ctxlite/mcp"] }
  }
}
```

### Cursor (HTTP proxy)

Add to your tool's MCP config:

```json
{
  "mcpServers": {
    "ctxlite": {
      "command": "ctxlite",
      "args": []
    }
  }
}
```
