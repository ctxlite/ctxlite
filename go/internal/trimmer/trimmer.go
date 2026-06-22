package trimmer

import (
	"fmt"
	"log/slog"
)

// Config holds trimmer configuration.
type Config struct {
	MaxContextTokens  int
	MinBM25Score      float64
	EnableImportGraph bool
	BM25              BM25Params
}

// TrimResult holds the result of a trim operation.
type TrimResult struct {
	Body        []byte
	TokensIn    int
	TokensUsed  int
	TokensSaved int
	TrimRatio   float64
	FilesIn     int
	FilesOut    int
}

// Trimmer performs context trimming on API request bodies.
type Trimmer struct {
	config Config
}

// New creates a Trimmer with the given config.
func New(config Config) *Trimmer {
	if config.MaxContextTokens == 0 {
		config.MaxContextTokens = 4096
	}
	if config.MinBM25Score == 0 {
		config.MinBM25Score = 0.1
	}
	if config.BM25.K1 == 0 {
		config.BM25 = DefaultBM25Params
	}
	if !config.EnableImportGraph {
		config.EnableImportGraph = true
	}
	return &Trimmer{config: config}
}

// Trim analyzes and trims the request body.
func (t *Trimmer) Trim(body []byte) TrimResult {
	parsed, err := Parse(body)
	if err != nil {
		slog.Debug("trimmer: parse failed, skipping", "err", err)
		return TrimResult{Body: body, TokensIn: EstimateTokens(body)}
	}

	if len(parsed.Files) == 0 || parsed.Query == "" {
		return TrimResult{
			Body:     body,
			TokensIn: EstimateTokens(body),
			FilesIn:  len(parsed.Files),
			FilesOut: len(parsed.Files),
		}
	}

	tokensIn := 0
	for _, f := range parsed.Files {
		tokensIn += f.Tokens
	}

	docs := make([]string, len(parsed.Files))
	for i, f := range parsed.Files {
		docs[i] = f.Path + " " + f.Content
	}
	scorer := NewBM25(docs, t.config.BM25)
	scores := scorer.ScoreAll(parsed.Query)

	var importBoosts map[string]float64
	if t.config.EnableImportGraph {
		graph := BuildImportGraph(parsed.Files)
		scoreMap := make(map[string]float64)
		for _, sd := range scores {
			scoreMap[parsed.Files[sd.Index].Path] = sd.Score
		}
		importBoosts = ImportBoost(graph, scoreMap)
	}

	selection := SelectFiles(
		parsed.Files,
		scores,
		importBoosts,
		t.config.MaxContextTokens,
		t.config.MinBM25Score,
	)

	if selection.TrimRatio < 0.10 {
		return TrimResult{
			Body:     body,
			TokensIn: tokensIn,
			FilesIn:  len(parsed.Files),
			FilesOut: len(parsed.Files),
		}
	}

	trimmedBody, err := rebuildRequest(parsed, selection.Selected)
	if err != nil {
		slog.Warn("trimmer: rebuild failed, using original", "err", err)
		return TrimResult{Body: body, TokensIn: tokensIn}
	}

	slog.Debug("trimmer: trimmed",
		"files_in", len(parsed.Files),
		"files_out", len(selection.Selected),
		"tokens_in", tokensIn,
		"tokens_saved", selection.TokensSaved,
		"ratio", fmt.Sprintf("%.0f%%", selection.TrimRatio*100),
	)

	return TrimResult{
		Body:        trimmedBody,
		TokensIn:    tokensIn,
		TokensUsed:  selection.TokensUsed,
		TokensSaved: selection.TokensSaved,
		TrimRatio:   selection.TrimRatio,
		FilesIn:     len(parsed.Files),
		FilesOut:    len(selection.Selected),
	}
}

func rebuildRequest(parsed ParsedRequest, selected []CodeFile) ([]byte, error) {
	switch parsed.Format {
	case FormatAnthropic:
		return rebuildAnthropic(parsed, selected)
	case FormatOpenAI:
		return rebuildOpenAI(parsed, selected)
	default:
		return parsed.Raw, nil
	}
}
