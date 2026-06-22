package stats

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	sqlite_vec "github.com/asg017/sqlite-vec-go-bindings/cgo"
	_ "github.com/mattn/go-sqlite3"
)

func init() {
	sqlite_vec.Auto()
}

const schema = `
CREATE TABLE IF NOT EXISTS requests (
    id           TEXT    PRIMARY KEY,
    ts           INTEGER NOT NULL,
    model        TEXT,
    cache_hit    BOOLEAN NOT NULL DEFAULT 0,
    cache_level  TEXT,
    similarity   REAL,
    tokens_in    INTEGER NOT NULL DEFAULT 0,
    tokens_used  INTEGER NOT NULL DEFAULT 0,
    tokens_out   INTEGER NOT NULL DEFAULT 0,
    cost_saved   REAL    NOT NULL DEFAULT 0,
    latency_ms   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT    PRIMARY KEY,
    started_at INTEGER NOT NULL,
    ended_at   INTEGER
);
`

// Store manages persistent statistics storage.
type Store struct {
	db *sql.DB
}

// RequestLog holds data for a single proxied request.
type RequestLog struct {
	Upstream   string
	CacheHit   bool
	CacheLevel string
	Similarity float64
	TokensIn   int
	TokensUsed int
	TokensOut  int
	CostSaved  float64
	LatencyMs  int64
	Streamed   bool
}

// LogRequest persists a request log entry.
func (s *Store) LogRequest(ctx context.Context, log RequestLog) {
	id := fmt.Sprintf("%d", time.Now().UnixNano())
	_, err := s.db.ExecContext(ctx, `
        INSERT INTO requests
        (id, ts, model, cache_hit, cache_level, similarity,
         tokens_in, tokens_used, tokens_out, cost_saved, latency_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, time.Now().Unix(), log.Upstream, log.CacheHit, log.CacheLevel,
		log.Similarity, log.TokensIn, log.TokensUsed, log.TokensOut,
		log.CostSaved, log.LatencyMs,
	)
	if err != nil {
		slog.Warn("failed to log request", "err", err)
	}
}

// Summary holds aggregated request statistics.
type Summary struct {
	TotalRequests    int
	CacheHits        int
	L1Hits           int
	L2Hits           int
	TrimmedRequests  int
	TokensSaved      int64
	TokensSavedCache int64
	TokensSavedTrim  int64
	CostSaved        float64
	AvgLatencyMs     int64
}

// HitRate returns cache hit percentage.
func (s Summary) HitRate() float64 {
	if s.TotalRequests == 0 {
		return 0
	}
	return float64(s.CacheHits) / float64(s.TotalRequests) * 100
}

// New opens (or creates) the SQLite database at path.
func New(path string) (*Store, error) {
	if path != ":memory:" {
		dir := filepath.Dir(path)
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return nil, fmt.Errorf("stats: create db dir: %w", err)
		}
	}

	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("stats: open db: %w", err)
	}

	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("stats: init schema: %w", err)
	}

	return &Store{db: db}, nil
}

// SessionSummary returns aggregated stats for all recorded requests.
func (s *Store) SessionSummary() Summary {
	return s.SummaryFrom(time.Time{})
}

// SummaryFrom returns aggregated stats since the given time.
// A zero time includes all records.
func (s *Store) SummaryFrom(since time.Time) Summary {
	var summary Summary

	query := `
SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cache_hit AND cache_level = 'L1' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cache_hit AND cache_level = 'L2' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT cache_hit AND tokens_in > tokens_used THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN cache_hit THEN tokens_in ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT cache_hit AND tokens_in > tokens_used THEN tokens_in - tokens_used ELSE 0 END), 0),
    COALESCE(SUM(cost_saved), 0),
    COALESCE(CAST(AVG(CASE WHEN NOT cache_hit THEN latency_ms END) AS INTEGER), 0)
FROM requests`

	args := []interface{}{}
	if !since.IsZero() {
		query += ` WHERE ts >= ?`
		args = append(args, since.Unix())
	}

	row := s.db.QueryRow(query, args...)
	if err := row.Scan(
		&summary.TotalRequests,
		&summary.CacheHits,
		&summary.L1Hits,
		&summary.L2Hits,
		&summary.TrimmedRequests,
		&summary.TokensSavedCache,
		&summary.TokensSavedTrim,
		&summary.CostSaved,
		&summary.AvgLatencyMs,
	); err != nil {
		return Summary{}
	}

	summary.TokensSaved = summary.TokensSavedCache + summary.TokensSavedTrim
	return summary
}

// CacheStatsResult holds cache storage statistics.
type CacheStatsResult struct {
	L1Entries     int64
	L1MaxEntries  int
	L1SizeBytes   int64
	L1OldestEntry time.Time
	L2Entries     int64
	L2SizeBytes   int64
	L2Enabled     bool
}

// CacheStats returns cache layer statistics.
func (s *Store) CacheStats() CacheStatsResult {
	s.ensureCacheSchema()

	var res CacheStatsResult
	res.L1MaxEntries = 10_000

	_ = s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(LENGTH(entry)), 0) FROM cache_exact`).
		Scan(&res.L1Entries, &res.L1SizeBytes)

	var oldestUnix sql.NullInt64
	_ = s.db.QueryRow(`SELECT MIN(created_at) FROM cache_exact`).Scan(&oldestUnix)
	if oldestUnix.Valid {
		res.L1OldestEntry = time.Unix(oldestUnix.Int64, 0)
	}

	_ = s.db.QueryRow(`SELECT COUNT(*) FROM cache_semantic_meta`).Scan(&res.L2Entries)
	_ = s.db.QueryRow(`SELECT COALESCE(SUM(LENGTH(entry)), 0) FROM cache_semantic_meta`).
		Scan(&res.L2SizeBytes)

	var tblCount int
	_ = s.db.QueryRow(`
        SELECT COUNT(*) FROM sqlite_master
        WHERE type='table' AND name='cache_semantic_vec'
    `).Scan(&tblCount)
	res.L2Enabled = tblCount > 0

	return res
}

// ClearL1 removes all L1 cache entries.
func (s *Store) ClearL1() (int64, error) {
	s.ensureCacheSchema()
	res, err := s.db.Exec(`DELETE FROM cache_exact`)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ClearL2 removes all L2 cache entries.
func (s *Store) ClearL2() (int64, error) {
	s.ensureCacheSchema()

	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`DELETE FROM cache_semantic_meta`)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}

	if _, err := tx.Exec(`DELETE FROM cache_semantic_vec`); err != nil {
		// vec table may not exist when L2 was never enabled
		var tblCount int
		_ = s.db.QueryRow(`
            SELECT COUNT(*) FROM sqlite_master
            WHERE type='table' AND name='cache_semantic_vec'
        `).Scan(&tblCount)
		if tblCount > 0 {
			return 0, err
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return n, nil
}

func (s *Store) ensureCacheSchema() {
	_, _ = s.db.Exec(`
        CREATE TABLE IF NOT EXISTS cache_exact (
            key        TEXT    PRIMARY KEY,
            entry      BLOB    NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            hit_count  INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS cache_semantic_meta (
            rowid      INTEGER PRIMARY KEY,
            entry      BLOB    NOT NULL,
            text_hash  TEXT    NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            hit_count  INTEGER NOT NULL DEFAULT 0
        );
    `)
}

// DB returns the underlying *sql.DB for use by other packages.
func (s *Store) DB() *sql.DB {
	return s.db
}

// Close closes the database connection.
func (s *Store) Close() error {
	if s.db == nil {
		return nil
	}
	return s.db.Close()
}
