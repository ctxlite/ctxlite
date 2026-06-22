package cli

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/ctxlite/ctxlite/go/internal/stats"
)

// StatsExport is the JSON export format for stats.
type StatsExport struct {
	Period           string    `json:"period"`
	GeneratedAt      time.Time `json:"generated_at"`
	TotalRequests    int       `json:"total_requests"`
	CacheHits        int       `json:"cache_hits"`
	L1Hits           int       `json:"l1_hits"`
	L2Hits           int       `json:"l2_hits"`
	HitRatePct       float64   `json:"hit_rate_pct"`
	TrimmedRequests  int       `json:"trimmed_requests"`
	TokensSavedCache int64     `json:"tokens_saved_cache"`
	TokensSavedTrim  int64     `json:"tokens_saved_trim"`
	TokensSavedTotal int64     `json:"tokens_saved_total"`
	CostSavedUSD     float64   `json:"cost_saved_usd"`
	AvgLatencyMs     int64     `json:"avg_latency_ms"`
}

func runStats(args []string, deps Deps) int {
	fs := flag.NewFlagSet("stats", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	last := fs.String("last", "session", "Period: session, today, 7d, 30d, all")
	export := fs.String("export", "text", "Export format: text, json")

	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "ctxlite stats: %v\n", err)
		return 1
	}

	if deps.Store == nil {
		fmt.Fprintln(os.Stderr, "ctxlite stats: database not available")
		return 1
	}

	since := parsePeriod(*last)
	summary := deps.Store.SummaryFrom(since)

	switch *export {
	case "json":
		return printStatsJSON(summary, *last)
	default:
		printStatsText(summary, *last)
		return 0
	}
}

func parsePeriod(period string) time.Time {
	switch period {
	case "session":
		return time.Now().Truncate(24 * time.Hour)
	case "today":
		now := time.Now()
		return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	case "7d":
		return time.Now().AddDate(0, 0, -7)
	case "30d":
		return time.Now().AddDate(0, 0, -30)
	case "all":
		return time.Time{}
	default:
		fmt.Fprintf(os.Stderr, "ctxlite stats: unknown period %q, using 'today'\n", period)
		return time.Now().Truncate(24 * time.Hour)
	}
}

func printStatsText(s stats.Summary, period string) {
	hitRate := 0.0
	if s.TotalRequests > 0 {
		hitRate = float64(s.CacheHits) / float64(s.TotalRequests) * 100
	}

	total := s.TokensSavedCache + s.TokensSavedTrim

	fmt.Printf(`
ctxlite stats — %s
─────────────────────────────────────────
Requests      %d total
Cache hits    %d (%.1f%%)
  L1 exact    %d
  L2 semantic %d
Trimmed       %d requests

Tokens saved
  Cache       %s
  Trimming    %s
  Total       %s

Cost saved    ~$%.4f

Avg latency   %dms (on misses)
─────────────────────────────────────────
`,
		periodLabel(period),
		s.TotalRequests,
		s.CacheHits, hitRate,
		s.L1Hits,
		s.L2Hits,
		s.TrimmedRequests,
		formatTokens(s.TokensSavedCache),
		formatTokens(s.TokensSavedTrim),
		formatTokens(total),
		s.CostSaved,
		s.AvgLatencyMs,
	)
}

func printStatsJSON(s stats.Summary, period string) int {
	total := s.TokensSavedCache + s.TokensSavedTrim
	hitRate := 0.0
	if s.TotalRequests > 0 {
		hitRate = float64(s.CacheHits) / float64(s.TotalRequests) * 100
	}

	export := StatsExport{
		Period:           periodLabel(period),
		GeneratedAt:      time.Now().UTC(),
		TotalRequests:    s.TotalRequests,
		CacheHits:        s.CacheHits,
		L1Hits:           s.L1Hits,
		L2Hits:           s.L2Hits,
		HitRatePct:       hitRate,
		TrimmedRequests:  s.TrimmedRequests,
		TokensSavedCache: s.TokensSavedCache,
		TokensSavedTrim:  s.TokensSavedTrim,
		TokensSavedTotal: total,
		CostSavedUSD:     s.CostSaved,
		AvgLatencyMs:     s.AvgLatencyMs,
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(export); err != nil {
		fmt.Fprintf(os.Stderr, "ctxlite stats: encode error: %v\n", err)
		return 1
	}
	return 0
}

func periodLabel(period string) string {
	switch period {
	case "session":
		return "current session"
	case "today":
		return "today"
	case "7d":
		return "last 7 days"
	case "30d":
		return "last 30 days"
	case "all":
		return "all time"
	default:
		return period
	}
}

func formatTokens(n int64) string {
	switch {
	case n >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	case n >= 1_000:
		return fmt.Sprintf("%.1fK", float64(n)/1_000)
	default:
		return fmt.Sprintf("%d", n)
	}
}
