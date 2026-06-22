package cache

import (
	"context"
	"fmt"
	"log/slog"
	"sync/atomic"
	"time"
)

// Config holds cache configuration.
type Config struct {
	DB                interface{}
	TTL               time.Duration
	SemanticThreshold float64
	EmbeddingProvider EmbeddingProvider
	MaxEntries        int
}

// Cache orchestrates L1 and L2 lookup/store.
type Cache struct {
	config   Config
	exact    *ExactCache
	semantic *SemanticCache
	l1Hits   atomic.Int64
	l2Hits   atomic.Int64
	misses   atomic.Int64
}

// Result holds a cache lookup result.
type Result struct {
	Entry      *Entry
	Hit        bool
	Level      string
	Similarity float64
}

// CacheStats holds cache metrics.
type CacheStats struct {
	L1Entries int64
	L2Entries int64
	L1Hits    int64
	L2Hits    int64
	Misses    int64
}

// New creates a Cache with both layers initialized.
func New(config Config) (*Cache, error) {
	if config.TTL == 0 {
		config.TTL = 24 * time.Hour
	}
	if config.SemanticThreshold == 0 {
		config.SemanticThreshold = 0.92
	}
	if config.MaxEntries == 0 {
		config.MaxEntries = 10_000
	}

	exact, err := newExactCache(config)
	if err != nil {
		return nil, fmt.Errorf("cache: init L1: %w", err)
	}

	semantic, err := newSemanticCache(config)
	if err != nil {
		return nil, fmt.Errorf("cache: init L2: %w", err)
	}

	return &Cache{config: config, exact: exact, semantic: semantic}, nil
}

// Get performs L1 then L2 lookup.
func (c *Cache) Get(ctx context.Context, requestBody []byte) Result {
	if entry, ok := c.exact.Get(ctx, requestBody); ok {
		slog.Debug("cache L1 hit")
		c.l1Hits.Add(1)
		return Result{Entry: entry, Hit: true, Level: "L1", Similarity: 1.0}
	}

	if entry, score, ok := c.semantic.Get(ctx, requestBody); ok {
		slog.Debug("cache L2 hit", "similarity", score)
		c.l2Hits.Add(1)
		return Result{Entry: entry, Hit: true, Level: "L2", Similarity: score}
	}

	c.misses.Add(1)
	return Result{Hit: false}
}

// Set stores entry in both L1 and L2.
func (c *Cache) Set(ctx context.Context, requestBody []byte, entry *Entry) {
	if err := c.exact.Set(ctx, requestBody, entry); err != nil {
		slog.Warn("cache L1 set failed", "err", err)
	}

	go func() {
		if err := c.semantic.Set(context.Background(), requestBody, entry); err != nil {
			slog.Warn("cache L2 set failed", "err", err)
		}
	}()
}

// Stats returns current cache statistics.
func (c *Cache) Stats(ctx context.Context) CacheStats {
	stats := CacheStats{
		L1Hits: c.l1Hits.Load(),
		L2Hits: c.l2Hits.Load(),
		Misses: c.misses.Load(),
	}

	if c.exact != nil && c.exact.db != nil {
		if err := c.exact.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM cache_exact`).Scan(&stats.L1Entries); err != nil {
			slog.Warn("cache stats L1 count failed", "err", err)
		}
	}
	if c.semantic != nil && c.semantic.db != nil {
		if err := c.semantic.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM cache_semantic_meta`).Scan(&stats.L2Entries); err != nil {
			slog.Warn("cache stats L2 count failed", "err", err)
		}
	}

	return stats
}

// StartEviction runs periodic TTL and LRU eviction in the background.
func (c *Cache) StartEviction(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				n, err := c.exact.Evict(ctx)
				if err != nil {
					slog.Warn("eviction error", "err", err)
				} else if n > 0 {
					slog.Debug("evicted expired entries", "count", n)
				}
				if err := c.exact.LRUEvict(ctx); err != nil {
					slog.Warn("lru eviction error", "err", err)
				}
			}
		}
	}()
}
