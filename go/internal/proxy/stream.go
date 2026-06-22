package proxy

import (
	"bufio"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/ctxlite/ctxlite/go/internal/stats"
	"github.com/ctxlite/ctxlite/go/internal/trimmer"
)

func (p *Proxy) pipeStream(
	w http.ResponseWriter,
	r *http.Request,
	resp *http.Response,
	start time.Time,
	upstream Upstream,
	trimResult trimmer.TrimResult,
) {
	defer resp.Body.Close()

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	copyHeaders(w.Header(), resp.Header)
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(resp.StatusCode)
	flusher.Flush()

	scanner := bufio.NewScanner(resp.Body)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	var events []string
	for scanner.Scan() {
		line := scanner.Text()
		events = append(events, line)
		if _, err := fmt.Fprintf(w, "%s\n", line); err != nil {
			slog.Warn("stream write interrupted", "err", err)
			return
		}
		flusher.Flush()
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		slog.Warn("stream interrupted", "err", err)
	}

	usage := trimmer.ParseStreamTokenUsage(events)
	tokensIn := usage.InputTokens
	if tokensIn == 0 {
		tokensIn = trimResult.TokensUsed
		if tokensIn == 0 {
			tokensIn = trimmer.EstimateTokens(trimResult.Body)
		}
	}

	p.logRequest(r.Context(), stats.RequestLog{
		Upstream:   upstream.Name,
		CacheHit:   false,
		Streamed:   true,
		TokensIn:   tokensIn,
		TokensUsed: trimResult.TokensUsed,
		TokensOut:  usage.OutputTokens,
		CostSaved:  estimateCost(trimResult.TokensSaved, upstream.Name),
		LatencyMs:  time.Since(start).Milliseconds(),
	})
}
