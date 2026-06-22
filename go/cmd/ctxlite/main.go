package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/ctxlite/ctxlite/go/internal/cache"
	"github.com/ctxlite/ctxlite/go/internal/cli"
	"github.com/ctxlite/ctxlite/go/internal/config"
	"github.com/ctxlite/ctxlite/go/internal/proxy"
	"github.com/ctxlite/ctxlite/go/internal/stats"
	"github.com/ctxlite/ctxlite/go/internal/trimmer"
)

var version = "0.1.0" // overridden by -ldflags at build time

func main() {
	osArgs := os.Args[1:]
	flagArgs, subcmdArgs := splitServerAndSubcommand(osArgs)

	configPath := config.DefaultPath()
	for i := 0; i < len(flagArgs)-1; i++ {
		if flagArgs[i] == "--config" {
			configPath = flagArgs[i+1]
		}
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		slog.Warn("config load failed, using defaults", "err", err)
	}

	configPathFlag := flag.String("config", configPath, "Config file path")
	port := flag.Int("port", 0, "HTTP proxy port")
	dbPath := flag.String("db", "", "SQLite cache database path")
	verbose := flag.Bool("verbose", false, "Verbose logging")
	ver := flag.Bool("version", false, "Print version")
	forceURL := flag.String("upstream-url", "", "Force all requests to this URL (for testing only). Default: pass-through from Host header")
	maxContext := flag.Int("max-context", 0, "Max tokens for context trimming")
	embeddingURL := flag.String("embedding-url", "", "OpenAI-compatible embeddings URL")
	embeddingKey := flag.String("embedding-key", "", "API key for embedding provider")
	embeddingModel := flag.String("embedding-model", "", "Embedding model name")

	if err := flag.CommandLine.Parse(flagArgs); err != nil {
		fmt.Fprintf(os.Stderr, "ctxlite: %v\n", err)
		os.Exit(1)
	}

	if *ver {
		fmt.Printf("ctxlite v%s\n", version)
		os.Exit(0)
	}

	cfg, err = config.Load(*configPathFlag)
	if err != nil {
		slog.Warn("config load failed, using defaults", "err", err)
	}
	cfg.MergeFlags(collectExplicitFlags())

	if *port != 0 {
		cfg.Port = *port
	}
	if *dbPath != "" {
		cfg.DB = *dbPath
	}
	if *verbose {
		cfg.Verbose = true
	}
	if *embeddingURL != "" {
		cfg.Embedding.URL = *embeddingURL
	}
	if *embeddingKey != "" {
		cfg.Embedding.Key = *embeddingKey
	}
	if *embeddingModel != "" {
		cfg.Embedding.Model = *embeddingModel
	}
	if *maxContext != 0 {
		cfg.Trimming.MaxContextTokens = *maxContext
	}

	level := slog.LevelInfo
	if cfg.Verbose {
		level = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level})))

	store, err := stats.New(cfg.DB)
	if err != nil {
		slog.Error("failed to open stats db", "err", err)
		os.Exit(1)
	}
	defer store.Close()

	if len(subcmdArgs) > 0 {
		exitCode := cli.Run(subcmdArgs, cli.Deps{Store: store})
		if exitCode >= 0 {
			os.Exit(exitCode)
		}
	}

	embProvider := selectEmbeddingProvider(cfg)

	cacheConfig := cache.Config{
		DB:                store.DB(),
		TTL:               cfg.Cache.TTL,
		SemanticThreshold: cfg.Cache.SemanticThreshold,
		MaxEntries:        cfg.Cache.MaxEntries,
		EmbeddingProvider: embProvider,
	}

	c, err := cache.New(cacheConfig)
	if err != nil {
		slog.Error("failed to init cache", "err", err)
		os.Exit(1)
	}

	t := trimmer.New(trimmer.Config{
		MaxContextTokens:  cfg.Trimming.MaxContextTokens,
		MinBM25Score:      cfg.Trimming.MinBM25Score,
		EnableImportGraph: cfg.Trimming.ImportGraph,
	})

	srv, err := proxy.New(proxy.Config{
		Port:    cfg.Port,
		Store:   store,
		Cache:   c,
		Trimmer: t,
		Upstream: proxy.UpstreamConfig{
			ForceURL: *forceURL,
		},
	})
	if err != nil {
		slog.Error("failed to create proxy", "err", err)
		os.Exit(1)
	}

	slog.Info(fmt.Sprintf("ctxlite v%s running", version),
		"proxy", fmt.Sprintf("127.0.0.1:%d", cfg.Port),
		"mcp", "stdio",
		"db", cfg.DB,
	)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	c.StartEviction(ctx)

	go func() {
		if err := srv.Start(); err != nil {
			slog.Error("proxy error", "err", err)
			stop()
		}
	}()

	// MCP server on stdio — SPEC-05
	// go mcp.Serve(ctx, store)

	<-ctx.Done()

	slog.Info("shutting down...")
	srv.Stop()
	printSessionSummary(store)
}

func splitServerAndSubcommand(args []string) (flagArgs, subcmdArgs []string) {
	for i, arg := range args {
		switch arg {
		case "stats", "cache", "help":
			return args[:i], args[i:]
		}
	}
	return args, nil
}

func collectExplicitFlags() map[string]string {
	explicit := make(map[string]string)
	flag.Visit(func(f *flag.Flag) {
		explicit[f.Name] = f.Value.String()
	})
	return explicit
}

func selectEmbeddingProvider(cfg config.Config) cache.EmbeddingProvider {
	url := cfg.Embedding.URL
	key := cfg.Embedding.Key
	model := cfg.Embedding.Model
	if model == "" {
		model = "text-embedding-3-small"
	}

	if url != "" {
		return cache.NewOpenAIEmbedding(url, key, model)
	}
	if key := os.Getenv("OPENAI_API_KEY"); key != "" {
		return cache.NewOpenAIEmbedding("https://api.openai.com", key, model)
	}
	slog.Warn("no embedding provider configured — L2 semantic cache disabled")
	return nil
}

func printSessionSummary(store *stats.Store) {
	summary := store.SessionSummary()
	fmt.Fprintf(os.Stderr, `
ctxlite session summary
───────────────────────────────────────
Requests      %d total   %d hits (%.1f%%)
Tokens saved  %d
Cost saved    ~$%.2f
───────────────────────────────────────
`,
		summary.TotalRequests,
		summary.CacheHits,
		summary.HitRate(),
		summary.TokensSaved,
		summary.CostSaved,
	)
}
