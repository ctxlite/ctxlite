package proxy

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/ctxlite/ctxlite/go/internal/cache"
	"github.com/ctxlite/ctxlite/go/internal/stats"
	"github.com/ctxlite/ctxlite/go/internal/trimmer"
)

// UpstreamConfig holds optional upstream overrides.
type UpstreamConfig struct {
	// ForceURL redirects all traffic to a single URL (testing only).
	// When empty, upstream is resolved from the request Host header.
	ForceURL string
}

// Config holds all proxy configuration.
type Config struct {
	Port         int
	Upstream     UpstreamConfig
	Store        *stats.Store
	Cache        *cache.Cache
	Trimmer      *trimmer.Trimmer
	MaxBodyBytes int64
}

// Proxy is the HTTP reverse proxy server.
type Proxy struct {
	config Config
	server *http.Server
}

// New creates a new Proxy. Returns error if config is invalid.
func New(config Config) (*Proxy, error) {
	if config.Port <= 0 || config.Port > 65535 {
		return nil, fmt.Errorf("proxy: invalid port %d", config.Port)
	}
	if config.MaxBodyBytes == 0 {
		config.MaxBodyBytes = 10 * 1024 * 1024
	}
	p := &Proxy{config: config}

	mux := http.NewServeMux()
	mux.Handle("/", p.applyMiddleware(http.HandlerFunc(p.handle)))

	p.server = &http.Server{
		Addr:         fmt.Sprintf("127.0.0.1:%d", config.Port),
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return p, nil
}

// Addr returns the loopback address the proxy listens on.
func (p *Proxy) Addr() string {
	return p.server.Addr
}

// Start begins listening. Blocks until Stop() is called.
func (p *Proxy) Start() error {
	ln, err := net.Listen("tcp", p.server.Addr)
	if err != nil {
		return fmt.Errorf("proxy: listen on %s: %w", p.server.Addr, err)
	}
	if err := p.server.Serve(ln); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("proxy: serve: %w", err)
	}
	return nil
}

// Stop gracefully shuts down with a 5s timeout.
func (p *Proxy) Stop() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := p.server.Shutdown(ctx); err != nil {
		slog.Error("proxy: shutdown", "err", err)
	}
}
