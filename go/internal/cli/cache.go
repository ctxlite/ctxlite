package cli

import (
	"flag"
	"fmt"
	"os"
	"time"
)

func runCache(args []string, deps Deps) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "ctxlite cache: missing command (stats, clear)")
		fmt.Fprintln(os.Stderr, "Run 'ctxlite help' for usage.")
		return 1
	}

	switch args[0] {
	case "stats":
		return runCacheStats(deps)
	case "clear":
		return runCacheClear(args[1:], deps)
	default:
		fmt.Fprintf(os.Stderr, "ctxlite cache: unknown command %q\n", args[0])
		return 1
	}
}

func runCacheStats(deps Deps) int {
	if deps.Store == nil {
		fmt.Fprintln(os.Stderr, "ctxlite cache stats: database not available")
		return 1
	}

	cs := deps.Store.CacheStats()

	fmt.Printf(`
ctxlite cache stats
─────────────────────────────────
L1 (exact match)
  Entries     %d / %d max
  Size        %s
  Oldest      %s

L2 (semantic)
  Entries     %d
  Size        %s
  Enabled     %v

Total size    %s
─────────────────────────────────
`,
		cs.L1Entries, cs.L1MaxEntries,
		formatBytes(cs.L1SizeBytes),
		formatAge(cs.L1OldestEntry),
		cs.L2Entries,
		formatBytes(cs.L2SizeBytes),
		cs.L2Enabled,
		formatBytes(cs.L1SizeBytes+cs.L2SizeBytes),
	)
	return 0
}

func runCacheClear(args []string, deps Deps) int {
	fs := flag.NewFlagSet("cache clear", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	onlyL1 := fs.Bool("l1", false, "Clear only exact match cache (L1)")
	onlyL2 := fs.Bool("l2", false, "Clear only semantic cache (L2)")

	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "ctxlite cache clear: %v\n", err)
		return 1
	}

	if deps.Store == nil {
		fmt.Fprintln(os.Stderr, "ctxlite cache clear: database not available")
		return 1
	}

	clearL1 := !*onlyL2
	clearL2 := !*onlyL1

	var totalCleared int64

	if clearL1 {
		n, err := deps.Store.ClearL1()
		if err != nil {
			fmt.Fprintf(os.Stderr, "ctxlite cache clear: L1 error: %v\n", err)
			return 1
		}
		totalCleared += n
		fmt.Fprintf(os.Stderr, "L1 cache cleared: %d entries removed\n", n)
	}

	if clearL2 {
		n, err := deps.Store.ClearL2()
		if err != nil {
			fmt.Fprintf(os.Stderr, "ctxlite cache clear: L2 error: %v\n", err)
			return 1
		}
		totalCleared += n
		fmt.Fprintf(os.Stderr, "L2 cache cleared: %d entries removed\n", n)
	}

	fmt.Fprintf(os.Stderr, "Done. %d total entries removed.\n", totalCleared)
	return 0
}

func formatBytes(n int64) string {
	switch {
	case n >= 1024*1024*1024:
		return fmt.Sprintf("%.1f GB", float64(n)/(1024*1024*1024))
	case n >= 1024*1024:
		return fmt.Sprintf("%.1f MB", float64(n)/(1024*1024))
	case n >= 1024:
		return fmt.Sprintf("%.1f KB", float64(n)/1024)
	default:
		return fmt.Sprintf("%d B", n)
	}
}

func formatAge(t time.Time) string {
	if t.IsZero() {
		return "N/A"
	}
	age := time.Since(t)
	switch {
	case age < time.Hour:
		return fmt.Sprintf("%d minutes ago", int(age.Minutes()))
	case age < 24*time.Hour:
		return fmt.Sprintf("%.1f hours ago", age.Hours())
	default:
		return fmt.Sprintf("%.0f days ago", age.Hours()/24)
	}
}
