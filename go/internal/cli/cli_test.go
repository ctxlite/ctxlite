package cli

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/ctxlite/ctxlite/go/internal/stats"
)

func TestParsePeriod(t *testing.T) {
	cases := []struct {
		input    string
		wantZero bool
	}{
		{"all", true},
		{"session", false},
		{"today", false},
		{"7d", false},
		{"30d", false},
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			got := parsePeriod(tc.input)
			isZero := got.IsZero()
			if isZero != tc.wantZero {
				t.Errorf("parsePeriod(%q).IsZero() = %v, want %v", tc.input, isZero, tc.wantZero)
			}
		})
	}
}

func TestRunStats_JSONExport(t *testing.T) {
	store, err := stats.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = w

	code := runStats([]string{"--export", "json", "--last", "all"}, Deps{Store: store})

	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	os.Stdout = old

	var buf bytes.Buffer
	if _, err := buf.ReadFrom(r); err != nil {
		t.Fatal(err)
	}
	output := buf.String()

	if code != 0 {
		t.Errorf("expected exit code 0, got %d", code)
	}

	var export StatsExport
	if err := json.Unmarshal([]byte(output), &export); err != nil {
		t.Errorf("invalid JSON output: %v\noutput: %s", err, output)
	}
	if export.GeneratedAt.IsZero() {
		t.Error("generated_at should not be zero")
	}
}

func setupStoreWithEntries(t *testing.T) *stats.Store {
	t.Helper()

	store, err := stats.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("close store: %v", err)
		}
	})

	now := time.Now().Unix()
	store.CacheStats() // ensure cache tables exist
	if _, err := store.DB().Exec(`INSERT INTO cache_exact (key, entry, created_at, expires_at)
        VALUES ('k1', X'7b7d', ?, ?)`, now, now+86400); err != nil {
		t.Fatal(err)
	}
	if _, err := store.DB().Exec(`INSERT INTO cache_semantic_meta (entry, text_hash, created_at, expires_at)
        VALUES (X'7b7d', 'h1', ?, ?)`, now, now+86400); err != nil {
		t.Fatal(err)
	}

	return store
}

func TestRunCacheClear_L1Only(t *testing.T) {
	store := setupStoreWithEntries(t)

	code := runCache([]string{"clear", "--l1"}, Deps{Store: store})
	if code != 0 {
		t.Errorf("expected exit code 0, got %d", code)
	}

	cs := store.CacheStats()
	if cs.L1Entries != 0 {
		t.Errorf("L1 should be empty after clear, got %d entries", cs.L1Entries)
	}
	if cs.L2Entries == 0 {
		t.Error("L2 should not be cleared when --l1 flag is used")
	}
}

func TestRunCacheClear_L2Only(t *testing.T) {
	store := setupStoreWithEntries(t)

	code := runCache([]string{"clear", "--l2"}, Deps{Store: store})
	if code != 0 {
		t.Errorf("expected 0, got %d", code)
	}

	cs := store.CacheStats()
	if cs.L2Entries != 0 {
		t.Errorf("L2 should be empty, got %d entries", cs.L2Entries)
	}
	if cs.L1Entries == 0 {
		t.Error("L1 should not be cleared when --l2 flag is used")
	}
}

func TestCLIRouter_UnknownSubcommand(t *testing.T) {
	code := Run([]string{"foo"}, Deps{})
	if code != 1 {
		t.Errorf("expected exit code 1 for unknown subcommand, got %d", code)
	}
}

func TestCLIRouter_NoSubcommand_ReturnsSentinel(t *testing.T) {
	code := Run([]string{}, Deps{})
	if code != -1 {
		t.Errorf("expected sentinel -1 for no subcommand, got %d", code)
	}
}
