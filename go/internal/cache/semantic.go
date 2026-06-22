package cache

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	sqlite_vec "github.com/asg017/sqlite-vec-go-bindings/cgo"
)

// SemanticCache implements L2 cache using cosine similarity via sqlite-vec.
type SemanticCache struct {
	db       *sql.DB
	config   Config
	embedder EmbeddingProvider
}

func newSemanticCache(config Config) (*SemanticCache, error) {
	if config.EmbeddingProvider == nil {
		return &SemanticCache{config: config, embedder: nil}, nil
	}

	db, ok := config.DB.(*sql.DB)
	if !ok || db == nil {
		return nil, fmt.Errorf("semantic cache: missing database")
	}

	dims := config.EmbeddingProvider.Dimensions()
	_, err := db.Exec(fmt.Sprintf(`
        CREATE VIRTUAL TABLE IF NOT EXISTS cache_semantic_vec
        USING vec0(embedding float[%d]);
    `, dims))
	if err != nil {
		return nil, fmt.Errorf("semantic cache: create vec table: %w", err)
	}

	_, err = db.Exec(`
        CREATE TABLE IF NOT EXISTS cache_semantic_meta (
            rowid      INTEGER PRIMARY KEY,
            entry      BLOB    NOT NULL,
            text_hash  TEXT    NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            hit_count  INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_semantic_expires
            ON cache_semantic_meta(expires_at);
    `)
	if err != nil {
		return nil, fmt.Errorf("semantic cache: create meta table: %w", err)
	}

	return &SemanticCache{db: db, config: config, embedder: config.EmbeddingProvider}, nil
}

func (s *SemanticCache) disabled() bool {
	return s.embedder == nil
}

// Get finds the most similar cached entry above the similarity threshold.
func (s *SemanticCache) Get(ctx context.Context, requestBody []byte) (*Entry, float64, bool) {
	if s.disabled() {
		return nil, 0, false
	}

	vec, err := s.embedder.Embed(ctx, string(requestBody))
	if err != nil {
		slog.Warn("L2 cache: embed failed", "err", err)
		return nil, 0, false
	}

	vecBytes, err := sqlite_vec.SerializeFloat32(vec)
	if err != nil {
		slog.Warn("L2 cache: serialize embedding failed", "err", err)
		return nil, 0, false
	}

	now := time.Now().Unix()

	var rowid int64
	var distance float64
	err = s.db.QueryRowContext(ctx, `
        SELECT sub.rowid, sub.distance
        FROM (
            SELECT rowid, distance
            FROM cache_semantic_vec
            WHERE embedding MATCH ?
              AND k = 5
        ) sub
        JOIN cache_semantic_meta m ON m.rowid = sub.rowid
        WHERE m.expires_at > ?
        ORDER BY sub.distance
        LIMIT 1
    `, vecBytes, now).Scan(&rowid, &distance)

	if err == sql.ErrNoRows {
		return nil, 0, false
	}
	if err != nil {
		slog.Warn("L2 cache: knn search failed", "err", err)
		return nil, 0, false
	}

	similarity := 1.0 - (distance * distance / 2.0)
	if similarity < s.config.SemanticThreshold {
		slog.Debug("L2 cache: below threshold", "similarity", similarity, "threshold", s.config.SemanticThreshold)
		return nil, similarity, false
	}

	var entryBytes []byte
	err = s.db.QueryRowContext(ctx,
		`SELECT entry FROM cache_semantic_meta WHERE rowid = ?`, rowid,
	).Scan(&entryBytes)
	if err != nil {
		return nil, 0, false
	}

	go func() {
		if _, err := s.db.Exec(
			`UPDATE cache_semantic_meta SET hit_count = hit_count + 1 WHERE rowid = ?`, rowid,
		); err != nil {
			slog.Warn("L2 cache hit count update failed", "err", err)
		}
	}()

	entry, err := deserialize(entryBytes)
	if err != nil {
		return nil, 0, false
	}

	return entry, similarity, true
}

// Set generates embedding and stores entry in both vec and meta tables.
func (s *SemanticCache) Set(ctx context.Context, requestBody []byte, entry *Entry) error {
	if s.disabled() {
		return nil
	}

	vec, err := s.embedder.Embed(ctx, string(requestBody))
	if err != nil {
		return fmt.Errorf("L2 cache embed: %w", err)
	}

	data, err := entry.serialize()
	if err != nil {
		return fmt.Errorf("L2 cache serialize: %w", err)
	}

	vecBytes, err := sqlite_vec.SerializeFloat32(vec)
	if err != nil {
		return fmt.Errorf("L2 cache serialize embedding: %w", err)
	}

	now := time.Now()
	expiresAt := now.Add(s.config.TTL).Unix()
	textHash := cacheKey(requestBody)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `
        INSERT INTO cache_semantic_meta (entry, text_hash, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    `, data, textHash, now.Unix(), expiresAt)
	if err != nil {
		return fmt.Errorf("L2 cache: insert meta: %w", err)
	}

	rowid, err := res.LastInsertId()
	if err != nil {
		return fmt.Errorf("L2 cache: last insert id: %w", err)
	}

	_, err = tx.ExecContext(ctx, `
        INSERT INTO cache_semantic_vec (rowid, embedding)
        VALUES (?, ?)
    `, rowid, vecBytes)
	if err != nil {
		return fmt.Errorf("L2 cache: insert vec: %w", err)
	}

	return tx.Commit()
}
