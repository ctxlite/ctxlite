package cli

import (
	"fmt"
	"os"

	"github.com/ctxlite/ctxlite/go/internal/cache"
	"github.com/ctxlite/ctxlite/go/internal/stats"
)

// Deps holds dependencies required by subcommands.
type Deps struct {
	Store *stats.Store
	Cache *cache.Cache
}

// Run parses arguments and dispatches to the matching subcommand.
// Returns -1 when no subcommand was given (start proxy + MCP server).
func Run(args []string, deps Deps) int {
	if len(args) == 0 {
		return -1
	}

	switch args[0] {
	case "stats":
		return runStats(args[1:], deps)
	case "cache":
		return runCache(args[1:], deps)
	case "help", "--help", "-h":
		printHelp()
		return 0
	default:
		fmt.Fprintf(os.Stderr, "ctxlite: unknown subcommand %q\n", args[0])
		fmt.Fprintf(os.Stderr, "Run 'ctxlite help' for usage.\n")
		return 1
	}
}

func printHelp() {
	fmt.Fprint(os.Stderr, `ctxlite — token optimizer for Cursor, OpenCode and Claude Code

USAGE:
  ctxlite [flags]              Start proxy + MCP server
  ctxlite stats [flags]        Show token savings statistics
  ctxlite cache <command>      Manage local cache
  ctxlite help                 Show this help

PROXY FLAGS:
  --port int              HTTP proxy port (default: 8080)
  --db string             SQLite database path (default: ~/.ctxlite/cache.db)
  --config string         Config file path (default: ~/.ctxlite/config.yaml)
  --upstream-url string   Force all traffic to one URL (testing only; default: Host pass-through)
  --embedding-url string  OpenAI-compatible embeddings URL
  --embedding-key string  API key for embedding provider
  --max-context int       Max tokens for context trimming (default: 4096)
  --verbose               Enable debug logging
  --version               Print version and exit

STATS FLAGS:
  --last string           Period: session, today, 7d, 30d, all (default: session)
  --export string         Export format: text, json (default: text)

CACHE COMMANDS:
  ctxlite cache stats     Show cache size and entry counts
  ctxlite cache clear     Clear all cache entries
  ctxlite cache clear --l1  Clear only exact match cache
  ctxlite cache clear --l2  Clear only semantic cache

EXAMPLES:
  ctxlite                          Start with defaults
  ctxlite --port 9090              Start on custom port
  ctxlite stats --last 7d          Show last 7 days savings
  ctxlite stats --export json      Export stats as JSON
  ctxlite cache clear              Clear all cached responses
  ctxlite cache clear --l2         Clear only semantic cache

CONFIGURATION:
  Config file: ~/.ctxlite/config.yaml
  All flags can be set in config. CLI flags override config values.
  See 'docs/configuration.md' for full reference.
`)
}
