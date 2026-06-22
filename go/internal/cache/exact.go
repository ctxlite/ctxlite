package cache

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"
)

// ExactCache implements L1 cache using SHA256 key matching.
type ExactCache struct {
	db     *sql.DB
	config Config
}

func newExactCache(config Config) (*ExactCache, error) {
	db, ok := config.DB.(*sql.DB)
	if !ok || db == nil {
		return nil, fmt.Errorf("exact cache: missing database")
	}

	_, err := db.Exec(`
        CREATE TABLE IF NOT EXISTS cache_exact (
            key        TEXT    PRIMARY KEY,
            entry      BLOB    NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            hit_count  INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_cache_exact_expires
            ON cache_exact(expires_at);
    `)
	if err != nil {
		return nil, fmt.Errorf("exact cache: create table: %w", err)
	}

	return &ExactCache{db: db, config: config}, nil
}

func cacheKey(requestBody []byte) string {
	normalized := bytes.TrimSpace(requestBody)
	hash := sha256.Sum256(normalized)
	return hex.EncodeToString(hash[:])
}

// Get returns cached entry for requestBody, or (nil, false) on miss/expired.
func (c *ExactCache) Get(ctx context.Context, requestBody []byte) (*Entry, bool) {
	key := cacheKey(requestBody)
	now := time.Now().Unix()

	var entryBytes []byte
	err := c.db.QueryRowContext(ctx, `
        SELECT entry FROM cache_exact
        WHERE key = ? AND expires_at > ?
    `, key, now).Scan(&entryBytes)

	if err == sql.ErrNoRows {
		return nil, false
	}
	if err != nil {
		slog.Warn("exact cache get error", "err", err)
		return nil, false
	}

	go func() {
		if _, err := c.db.Exec(`UPDATE cache_exact SET hit_count = hit_count + 1 WHERE key = ?`, key); err != nil {
			slog.Warn("exact cache hit count update failed", "err", err)
		}
	}()

	entry, err := deserialize(entryBytes)
	if err != nil {
		slog.Warn("exact cache deserialize error", "err", err)
		return nil, false
	}

	return entry, true
}

// Set stores entry with TTL.
func (c *ExactCache) Set(ctx context.Context, requestBody []byte, entry *Entry) error {
	key := cacheKey(requestBody)
	entry.RequestHash = key

	data, err := entry.serialize()
	if err != nil {
		return fmt.Errorf("exact cache serialize: %w", err)
	}

	now := time.Now()
	expiresAt := now.Add(c.config.TTL).Unix()

	_, err = c.db.ExecContext(ctx, `
        INSERT INTO cache_exact (key, entry, created_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            entry = excluded.entry,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at,
            hit_count = 0
    `, key, data, now.Unix(), expiresAt)
	if err != nil {
		return err
	}

	return c.LRUEvict(ctx)
}

// Evict removes expired entries.
func (c *ExactCache) Evict(ctx context.Context) (int64, error) {
	res, err := c.db.ExecContext(ctx,
		`DELETE FROM cache_exact WHERE expires_at <= ?`, time.Now().Unix(),
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// LRUEvict removes oldest entries when MaxEntries is exceeded.
func (c *ExactCache) LRUEvict(ctx context.Context) error {
	var count int64
	if err := c.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM cache_exact`).Scan(&count); err != nil {
		return err
	}
	if count <= int64(c.config.MaxEntries) {
		return nil
	}

	toDelete := count - int64(c.config.MaxEntries)
	_, err := c.db.ExecContext(ctx, `
        DELETE FROM cache_exact WHERE key IN (
            SELECT key FROM cache_exact
            ORDER BY created_at ASC
            LIMIT ?
        )
    `, toDelete)
	return err
}
