package stats

import (
	"path/filepath"
	"testing"
)

func TestNewAndSessionSummary(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, "cache.db")

	store, err := New(path)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer store.Close()

	summary := store.SessionSummary()
	if summary.TotalRequests != 0 {
		t.Fatalf("TotalRequests = %d, want 0", summary.TotalRequests)
	}
	if summary.CacheHits != 0 {
		t.Fatalf("CacheHits = %d, want 0", summary.CacheHits)
	}
	if summary.HitRate() != 0 {
		t.Fatalf("HitRate() = %f, want 0", summary.HitRate())
	}
}

func TestHitRate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		summary  Summary
		expected float64
	}{
		{
			name:     "zero requests",
			summary:  Summary{},
			expected: 0,
		},
		{
			name: "half hits",
			summary: Summary{
				TotalRequests: 4,
				CacheHits:     2,
			},
			expected: 50,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := tt.summary.HitRate(); got != tt.expected {
				t.Fatalf("HitRate() = %f, want %f", got, tt.expected)
			}
		})
	}
}
