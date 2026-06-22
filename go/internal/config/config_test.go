package config

import (
	"os"
	"testing"
)

func TestConfigLoad_MissingFile_ReturnsDefaults(t *testing.T) {
	cfg, err := Load("/tmp/ctxlite-nonexistent-config-xyz.yaml")
	if err != nil {
		t.Errorf("expected no error for missing config, got: %v", err)
	}
	if cfg.Port != 8080 {
		t.Errorf("expected default port 8080, got %d", cfg.Port)
	}
}

func TestConfigLoad_ValuesOverrideDefaults(t *testing.T) {
	content := []byte("port: 9090\nverbose: true\n")
	f, err := os.CreateTemp("", "ctxlite-config-*.yaml")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())
	if _, err := f.Write(content); err != nil {
		t.Fatal(err)
	}
	f.Close()

	cfg, err := Load(f.Name())
	if err != nil {
		t.Fatal(err)
	}

	if cfg.Port != 9090 {
		t.Errorf("expected port 9090, got %d", cfg.Port)
	}
	if !cfg.Verbose {
		t.Error("expected verbose=true")
	}
	if cfg.DB == "" {
		t.Error("DB should have default value")
	}
}

func TestConfigMergeFlags_CLIOverridesConfig(t *testing.T) {
	cfg := Defaults()
	cfg.Port = 9090

	cfg.MergeFlags(map[string]string{"port": "7777"})

	if cfg.Port != 7777 {
		t.Errorf("expected port 7777 after flag merge, got %d", cfg.Port)
	}
}
