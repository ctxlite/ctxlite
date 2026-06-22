package trimmer

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestTokenize(t *testing.T) {
	cases := []struct {
		input string
		want  []string
	}{
		{"getUserById", []string{"get", "user", "by", "id"}},
		{"compute_bunkerul_signal", []string{"compute", "bunkerul", "signal"}},
		{"HTTPHandler", []string{"http", "handler"}},
		{"the a an is", []string{}},
	}
	for _, tc := range cases {
		got := tokenize(tc.input)
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("tokenize(%q) = %v, want %v", tc.input, got, tc.want)
		}
	}
}

func TestBM25_RelevantFileScoresHigher(t *testing.T) {
	docs := []string{
		"func Login(user string) error { return auth.Validate(user) }",
		"func RenderTemplate(name string) []byte { return templates[name] }",
		"func HashPassword(pwd string) string { return bcrypt.Hash(pwd) }",
	}
	scorer := NewBM25(docs, DefaultBM25Params)
	scores := scorer.ScoreAll("login authentication user validate")

	if scores[0].Index != 0 {
		t.Errorf("expected doc 0 to rank first, got doc %d", scores[0].Index)
	}
}

func TestSelectFiles_RespectsTokenBudget(t *testing.T) {
	files := []CodeFile{
		{Path: "a.go", Content: strings.Repeat("x", 400), Tokens: 100},
		{Path: "b.go", Content: strings.Repeat("y", 400), Tokens: 100},
		{Path: "c.go", Content: strings.Repeat("z", 400), Tokens: 100},
	}
	scores := []ScoredDoc{{0, 10.0}, {1, 8.0}, {2, 6.0}}

	result := SelectFiles(files, scores, nil, 150, 0.0)

	if result.TokensUsed > 150 {
		t.Errorf("tokens used %d exceeds budget 150", result.TokensUsed)
	}
	if len(result.Selected) != 1 {
		t.Errorf("expected 1 file selected, got %d", len(result.Selected))
	}
}

func TestParseTokenUsage_Anthropic(t *testing.T) {
	body := []byte(`{
        "id": "msg_01",
        "type": "message",
        "usage": {
            "input_tokens": 1250,
            "output_tokens": 340
        }
    }`)

	usage := ParseTokenUsage(body)
	if usage.InputTokens != 1250 {
		t.Errorf("input tokens: got %d, want 1250", usage.InputTokens)
	}
	if usage.OutputTokens != 340 {
		t.Errorf("output tokens: got %d, want 340", usage.OutputTokens)
	}
	if usage.TotalTokens != 1590 {
		t.Errorf("total tokens: got %d, want 1590", usage.TotalTokens)
	}
}

func TestParseTokenUsage_OpenAI(t *testing.T) {
	body := []byte(`{
        "id": "chatcmpl-abc",
        "usage": {
            "prompt_tokens": 890,
            "completion_tokens": 210,
            "total_tokens": 1100
        }
    }`)

	usage := ParseTokenUsage(body)
	if usage.InputTokens != 890 {
		t.Errorf("got %d, want 890", usage.InputTokens)
	}
	if usage.OutputTokens != 210 {
		t.Errorf("got %d, want 210", usage.OutputTokens)
	}
}

func TestParseTokenUsage_InvalidBody(t *testing.T) {
	usage := ParseTokenUsage([]byte(`not json`))
	if usage.TotalTokens != 0 {
		t.Error("expected zero usage for invalid body")
	}
}

func TestTrimmer_NoFilesReturnsOriginal(t *testing.T) {
	tr := New(Config{MaxContextTokens: 4096})
	body := []byte(`{"model":"claude","messages":[{"role":"user","content":"hello"}]}`)

	result := tr.Trim(body)
	if !bytes.Equal(result.Body, body) {
		t.Error("body should be unchanged when no files present")
	}
}

func TestImportBoost_ImportedFileGetsBonus(t *testing.T) {
	graph := ImportGraph{
		"main.go": []string{"./internal/auth"},
	}
	scores := map[string]float64{
		"main.go": 10.0,
	}

	boosts := ImportBoost(graph, scores)

	if boosts["./internal/auth"] == 0 {
		t.Error("imported file should receive boost")
	}
	if boosts["./internal/auth"] != 10.0*0.3 {
		t.Errorf("expected boost %.1f, got %.1f", 10.0*0.3, boosts["./internal/auth"])
	}
}

func TestTrimmer_KeepsLoginFile(t *testing.T) {
	tr := New(Config{
		MaxContextTokens:  500,
		MinBM25Score:      0.0,
		EnableImportGraph: false,
	})

	makeFile := func(path, content string) string {
		return formatCodeBlock(CodeFile{Path: path, Language: "go", Content: content})
	}

	loginContent := strings.Repeat("func Login(user string) error { return auth.Validate(user) }\n", 30)
	body, err := json.Marshal(map[string]interface{}{
		"model": "claude-opus-4-6",
		"messages": []map[string]interface{}{
			{
				"role": "user",
				"content": []map[string]string{
					{"type": "text", "text": "Refactor the login function"},
					{"type": "text", "text": makeFile("internal/auth/login.go", loginContent)},
					{"type": "text", "text": makeFile("internal/ui/template.go", strings.Repeat("func RenderTemplate(name string) []byte { return templates[name] }\n", 30))},
					{"type": "text", "text": makeFile("internal/db/migrate.go", strings.Repeat("func RunMigrations(db *sql.DB) error { return nil }\n", 30))},
					{"type": "text", "text": makeFile("internal/metrics/stats.go", strings.Repeat("func RecordMetric(name string, value float64) {}\n", 30))},
					{"type": "text", "text": makeFile("internal/cache/redis.go", strings.Repeat("func GetCache(key string) (string, error) { return \"\", nil }\n", 30))},
				},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	result := tr.Trim(body)
	if result.FilesOut >= result.FilesIn {
		t.Fatalf("expected fewer files out, got %d/%d", result.FilesOut, result.FilesIn)
	}
	if !bytes.Contains(result.Body, []byte("internal/auth/login.go")) {
		t.Error("login file should remain after trim")
	}
	if bytes.Contains(result.Body, []byte("internal/metrics/stats.go")) {
		t.Error("unrelated metrics file should be removed")
	}
}
