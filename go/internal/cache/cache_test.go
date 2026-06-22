package cache

import (
	"context"
	"database/sql"
	"net/http"
	"testing"
	"time"

	"github.com/ctxlite/ctxlite/go/internal/stats"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()

	store, err := stats.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("close test db: %v", err)
		}
	})
	return store.DB()
}

func TestExactCache_HitOnSameBody(t *testing.T) {
	db := openTestDB(t)
	c, err := newExactCache(Config{DB: db, TTL: time.Hour, MaxEntries: 100})
	if err != nil {
		t.Fatal(err)
	}

	body := []byte(`{"model":"claude-3","messages":[{"role":"user","content":"hello"}]}`)
	entry := &Entry{StatusCode: 200, Body: []byte(`{"response":"world"}`)}

	if err := c.Set(context.Background(), body, entry); err != nil {
		t.Fatal(err)
	}

	got, ok := c.Get(context.Background(), body)
	if !ok {
		t.Fatal("expected hit")
	}
	if string(got.Body) != string(entry.Body) {
		t.Errorf("body mismatch: got %s", got.Body)
	}
}

func TestExactCache_MissOnDifferentBody(t *testing.T) {
	db := openTestDB(t)
	c, err := newExactCache(Config{DB: db, TTL: time.Hour, MaxEntries: 100})
	if err != nil {
		t.Fatal(err)
	}

	body1 := []byte(`{"model":"claude-3","messages":[{"role":"user","content":"hello"}]}`)
	body2 := []byte(`{"model":"claude-3","messages":[{"role":"user","content":"goodbye"}]}`)
	entry := &Entry{StatusCode: 200, Body: []byte(`{"response":"world"}`)}

	if err := c.Set(context.Background(), body1, entry); err != nil {
		t.Fatal(err)
	}

	_, ok := c.Get(context.Background(), body2)
	if ok {
		t.Fatal("expected miss")
	}
}

func TestExactCache_ExpiredTTL(t *testing.T) {
	db := openTestDB(t)
	c, err := newExactCache(Config{DB: db, TTL: 1 * time.Millisecond, MaxEntries: 100})
	if err != nil {
		t.Fatal(err)
	}

	body := []byte(`{"test":"expired"}`)
	entry := &Entry{StatusCode: 200, Body: []byte(`{}`)}
	if err := c.Set(context.Background(), body, entry); err != nil {
		t.Fatal(err)
	}

	time.Sleep(10 * time.Millisecond)

	_, ok := c.Get(context.Background(), body)
	if ok {
		t.Fatal("expected miss after TTL expiry")
	}
}

func TestSanitizeHeaders_RemovesSensitive(t *testing.T) {
	h := http.Header{}
	h.Set("Authorization", "Bearer sk-secret")
	h.Set("X-Api-Key", "key123")
	h.Set("Content-Type", "application/json")

	sanitized := SanitizeHeaders(h)

	if sanitized.Get("Authorization") != "" {
		t.Error("Authorization should be removed")
	}
	if sanitized.Get("X-Api-Key") != "" {
		t.Error("X-Api-Key should be removed")
	}
	if sanitized.Get("Content-Type") == "" {
		t.Error("Content-Type should be kept")
	}
}

func TestSemanticCache_DisabledWithoutProvider(t *testing.T) {
	db := openTestDB(t)
	s, err := newSemanticCache(Config{DB: db, EmbeddingProvider: nil})
	if err != nil {
		t.Fatal(err)
	}

	_, _, ok := s.Get(context.Background(), []byte(`{"test":"data"}`))
	if ok {
		t.Fatal("expected miss when disabled")
	}
}

func TestSemanticCache_HitWithHashEmbedding(t *testing.T) {
	db := openTestDB(t)
	embedder := &HashEmbedding{}
	s, err := newSemanticCache(Config{
		DB:                db,
		TTL:               time.Hour,
		SemanticThreshold: 0.99,
		EmbeddingProvider: embedder,
	})
	if err != nil {
		t.Fatal(err)
	}

	body := []byte(`{"test":"semantic"}`)
	entry := &Entry{StatusCode: 200, Body: []byte(`{"ok":true}`)}

	if err := s.Set(context.Background(), body, entry); err != nil {
		t.Fatal(err)
	}

	got, score, ok := s.Get(context.Background(), body)
	if !ok {
		t.Fatalf("expected hit, score=%.3f", score)
	}
	if string(got.Body) != string(entry.Body) {
		t.Error("body mismatch")
	}
}

func TestCache_L1BeforeL2(t *testing.T) {
	db := openTestDB(t)
	embedder := &HashEmbedding{}
	cacheMgr, err := New(Config{
		DB:                db,
		TTL:               time.Hour,
		MaxEntries:        100,
		SemanticThreshold: 0.5,
		EmbeddingProvider: embedder,
	})
	if err != nil {
		t.Fatal(err)
	}

	body := []byte(`{"test":"both"}`)
	entry := &Entry{StatusCode: 200, Body: []byte(`{"ok":true}`)}

	cacheMgr.Set(context.Background(), body, entry)
	time.Sleep(50 * time.Millisecond)

	result := cacheMgr.Get(context.Background(), body)
	if !result.Hit {
		t.Fatal("expected hit")
	}
	if result.Level != "L1" {
		t.Errorf("want L1, got %s", result.Level)
	}
}

func TestCache_EvictionOnEmptyTables(t *testing.T) {
	db := openTestDB(t)
	cacheMgr, err := New(Config{DB: db, TTL: time.Hour, MaxEntries: 100})
	if err != nil {
		t.Fatal(err)
	}

	n, err := cacheMgr.exact.Evict(context.Background())
	if err != nil {
		t.Fatalf("Evict() error = %v", err)
	}
	if n != 0 {
		t.Fatalf("Evict() = %d, want 0", n)
	}
	if err := cacheMgr.exact.LRUEvict(context.Background()); err != nil {
		t.Fatalf("LRUEvict() error = %v", err)
	}
}
