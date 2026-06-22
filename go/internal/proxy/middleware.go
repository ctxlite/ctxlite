package proxy

import (
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"
)

func (p *Proxy) applyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic in handler", "err", rec, "stack", string(debug.Stack()))
				http.Error(w, "internal error", http.StatusInternalServerError)
			}
		}()

		slog.Debug("request",
			"method", r.Method,
			"path", r.URL.Path,
			"content_type", r.Header.Get("Content-Type"),
		)

		if r.Method == http.MethodPost {
			ct := r.Header.Get("Content-Type")
			if ct == "" {
				http.Error(w, "Content-Type required", http.StatusBadRequest)
				return
			}
		}

		next.ServeHTTP(w, r)

		slog.Debug("response", "path", r.URL.Path, "latency_ms", time.Since(start).Milliseconds())
	})
}
