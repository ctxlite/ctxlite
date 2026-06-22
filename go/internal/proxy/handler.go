package proxy

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/ctxlite/ctxlite/go/internal/cache"
	"github.com/ctxlite/ctxlite/go/internal/stats"
	"github.com/ctxlite/ctxlite/go/internal/trimmer"
)

var pricePerMillion = map[string]float64{
	"anthropic": 3.00,
	"openai":    2.50,
}

func (p *Proxy) handle(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	ctx := r.Context()

	body, err := io.ReadAll(io.LimitReader(r.Body, p.config.MaxBodyBytes+1))
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()
	if int64(len(body)) > p.config.MaxBodyBytes {
		http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
		return
	}

	upstream, err := p.resolveUpstream(r)
	if err != nil {
		slog.Error("proxy: resolve upstream", "err", err)
		http.Error(w, "cannot determine upstream", http.StatusBadGateway)
		return
	}

	if p.config.Cache != nil {
		if result := p.config.Cache.Get(ctx, body); result.Hit {
			copyHeaders(w.Header(), result.Entry.Headers)
			w.WriteHeader(result.Entry.StatusCode)
			if _, err := w.Write(result.Entry.Body); err != nil {
				slog.Error("proxy: write cached response", "err", err)
			}
			p.logRequest(ctx, stats.RequestLog{
				Upstream:   upstream.Name,
				CacheHit:   true,
				CacheLevel: result.Level,
				Similarity: result.Similarity,
				TokensIn:   trimmer.EstimateTokens(body),
				LatencyMs:  time.Since(start).Milliseconds(),
			})
			return
		}
	}

	trimResult := trimmer.TrimResult{Body: body, TokensIn: trimmer.EstimateTokens(body)}
	if p.config.Trimmer != nil {
		trimResult = p.config.Trimmer.Trim(body)
		if trimResult.TokensSaved > 0 {
			fmt.Fprintf(os.Stderr, "[ctxlite] TRIM  %-10s %d→%d tok (-%d%%) | %d/%d files\n",
				upstream.Name,
				trimResult.TokensIn,
				trimResult.TokensUsed,
				int(trimResult.TrimRatio*100),
				trimResult.FilesOut,
				trimResult.FilesIn,
			)
		}
	}

	isStream, streamResp, respBody, respHeaders, statusCode, err := p.detectStreamAndForward(r, upstream, trimResult.Body)
	if err != nil {
		slog.Error("upstream error", "upstream", upstream.Name, "err", err)
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	if isStream {
		p.pipeStream(w, r, streamResp, start, upstream, trimResult)
		return
	}

	if p.config.Cache != nil {
		p.config.Cache.Set(ctx, body, &cache.Entry{
			StatusCode: statusCode,
			Headers:    cache.SanitizeHeaders(respHeaders),
			Body:       respBody,
			CachedAt:   time.Now(),
		})
	}

	usage := trimmer.ParseTokenUsage(respBody)
	tokensIn := usage.InputTokens
	if tokensIn == 0 {
		tokensIn = trimResult.TokensUsed
		if tokensIn == 0 {
			tokensIn = trimmer.EstimateTokens(trimResult.Body)
		}
	}

	p.logRequest(ctx, stats.RequestLog{
		Upstream:   upstream.Name,
		CacheHit:   false,
		TokensIn:   tokensIn,
		TokensUsed: trimResult.TokensUsed,
		TokensOut:  usage.OutputTokens,
		CostSaved:  estimateCost(trimResult.TokensSaved, upstream.Name),
		LatencyMs:  time.Since(start).Milliseconds(),
	})

	copyHeaders(w.Header(), respHeaders)
	w.WriteHeader(statusCode)
	if _, err := w.Write(respBody); err != nil {
		slog.Error("proxy: write response", "err", err)
	}
}

func estimateCost(tokensSaved int, upstream string) float64 {
	if tokensSaved <= 0 {
		return 0
	}
	price, ok := pricePerMillion[upstream]
	if !ok {
		price = 3.00
	}
	return float64(tokensSaved) / 1_000_000 * price
}

func (p *Proxy) logRequest(ctx context.Context, log stats.RequestLog) {
	if p.config.Store != nil {
		p.config.Store.LogRequest(ctx, log)
	}
	logRequestLine(log)
}

func logRequestLine(log stats.RequestLog) {
	if log.Streamed {
		fmt.Fprintf(os.Stderr, "[ctxlite] STREAM %-9s --              | %dms\n",
			log.Upstream, log.LatencyMs)
		return
	}
	if log.CacheHit {
		if log.CacheLevel == "L2" {
			fmt.Fprintf(os.Stderr, "[ctxlite] HIT   %-10s %d tok saved | %s  | sim=%.2f | %dms\n",
				log.Upstream, log.TokensIn, log.CacheLevel, log.Similarity, log.LatencyMs)
			return
		}
		fmt.Fprintf(os.Stderr, "[ctxlite] HIT   %-10s %d tok saved | %s | <1ms\n",
			log.Upstream, log.TokensIn, log.CacheLevel)
		return
	}
	fmt.Fprintf(os.Stderr, "[ctxlite] MISS  %-10s %d tok | %dms\n",
		log.Upstream, log.TokensIn, log.LatencyMs)
}
