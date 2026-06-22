package config

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

// Config holds all ctxlite settings. CLI flags override config file values.
type Config struct {
	Port         int           `yaml:"port"`
	DB           string        `yaml:"db"`
	Embedding    EmbeddingConf `yaml:"embedding"`
	Trimming     TrimmingConf  `yaml:"trimming"`
	Cache        CacheConf     `yaml:"cache"`
	Verbose      bool          `yaml:"verbose"`
}

// EmbeddingConf holds embedding provider settings.
type EmbeddingConf struct {
	URL   string `yaml:"url"`
	Key   string `yaml:"key"`
	Model string `yaml:"model"`
}

// TrimmingConf holds context trimmer settings.
type TrimmingConf struct {
	MaxContextTokens int     `yaml:"max_context_tokens"`
	MinBM25Score     float64 `yaml:"min_bm25_score"`
	ImportGraph      bool    `yaml:"import_graph"`
}

// CacheConf holds cache layer settings.
type CacheConf struct {
	TTL               time.Duration `yaml:"ttl"`
	SemanticThreshold float64       `yaml:"semantic_threshold"`
	MaxEntries        int           `yaml:"max_entries"`
}

// Defaults returns the default configuration.
func Defaults() Config {
	home, _ := os.UserHomeDir()
	return Config{
		Port: 8080,
		DB:   filepath.Join(home, ".ctxlite", "cache.db"),
		Embedding: EmbeddingConf{
			Model: "text-embedding-3-small",
		},
		Trimming: TrimmingConf{
			MaxContextTokens: 4096,
			MinBM25Score:     0.1,
			ImportGraph:      true,
		},
		Cache: CacheConf{
			TTL:               24 * time.Hour,
			SemanticThreshold: 0.92,
			MaxEntries:        10_000,
		},
	}
}

// DefaultPath returns the default config file path.
func DefaultPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".ctxlite", "config.yaml")
}

// Load reads a config file and merges it with defaults.
// A missing file is not an error.
func Load(path string) (Config, error) {
	cfg := Defaults()
	path = expandPath(path)

	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, fmt.Errorf("config: read %s: %w", path, err)
	}

	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("config: parse %s: %w", path, err)
	}

	if cfg.DB != "" {
		cfg.DB = expandPath(cfg.DB)
	}

	return cfg, nil
}

// MergeFlags applies explicitly set CLI flags over the config.
func (c *Config) MergeFlags(set map[string]string) {
	if v, ok := set["port"]; ok {
		_, _ = fmt.Sscan(v, &c.Port)
	}
	if v, ok := set["db"]; ok {
		c.DB = expandPath(v)
	}
	if v, ok := set["embedding-url"]; ok {
		c.Embedding.URL = v
	}
	if v, ok := set["embedding-key"]; ok {
		c.Embedding.Key = v
	}
	if v, ok := set["embedding-model"]; ok {
		c.Embedding.Model = v
	}
	if v, ok := set["max-context"]; ok {
		_, _ = fmt.Sscan(v, &c.Trimming.MaxContextTokens)
	}
	if _, ok := set["verbose"]; ok {
		c.Verbose = true
	}
}

func expandPath(path string) string {
	if len(path) >= 2 && path[:2] == "~/" {
		home, err := os.UserHomeDir()
		if err != nil {
			return path
		}
		return filepath.Join(home, path[2:])
	}
	return path
}
