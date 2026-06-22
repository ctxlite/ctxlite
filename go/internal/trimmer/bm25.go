package trimmer

import (
	"math"
	"regexp"
	"sort"
	"strings"
)

// BM25Params holds BM25 hyperparameters.
type BM25Params struct {
	K1 float64
	B  float64
}

// DefaultBM25Params returns sensible defaults for code files.
var DefaultBM25Params = BM25Params{K1: 1.5, B: 0.75}

// BM25 scores documents against a query using BM25 algorithm.
type BM25 struct {
	params    BM25Params
	docs      [][]string
	avgDocLen float64
	idf       map[string]float64
}

// ScoredDoc pairs a document index with its BM25 score.
type ScoredDoc struct {
	Index int
	Score float64
}

// NewBM25 creates a BM25 scorer for the given documents.
func NewBM25(docs []string, params BM25Params) *BM25 {
	tokenized := make([][]string, len(docs))
	totalLen := 0
	for i, doc := range docs {
		tokens := tokenize(doc)
		tokenized[i] = tokens
		totalLen += len(tokens)
	}

	avgLen := 0.0
	if len(docs) > 0 {
		avgLen = float64(totalLen) / float64(len(docs))
	}

	return &BM25{
		params:    params,
		docs:      tokenized,
		avgDocLen: avgLen,
		idf:       computeIDF(tokenized),
	}
}

// Score returns BM25 relevance score for docIndex against query.
func (b *BM25) Score(docIndex int, query string) float64 {
	queryTokens := tokenize(query)
	doc := b.docs[docIndex]
	docLen := float64(len(doc))

	tf := make(map[string]int)
	for _, t := range doc {
		tf[t]++
	}

	score := 0.0
	for _, qt := range queryTokens {
		idf := b.idf[qt]
		freq := float64(tf[qt])

		numerator := freq * (b.params.K1 + 1)
		denominator := freq + b.params.K1*(1-b.params.B+b.params.B*(docLen/b.avgDocLen))
		score += idf * (numerator / denominator)
	}
	return score
}

// ScoreAll returns scores for all documents, sorted descending.
func (b *BM25) ScoreAll(query string) []ScoredDoc {
	scores := make([]ScoredDoc, len(b.docs))
	for i := range b.docs {
		scores[i] = ScoredDoc{Index: i, Score: b.Score(i, query)}
	}
	sort.Slice(scores, func(i, j int) bool {
		return scores[i].Score > scores[j].Score
	})
	return scores
}

func computeIDF(docs [][]string) map[string]float64 {
	N := float64(len(docs))
	df := make(map[string]int)
	for _, doc := range docs {
		seen := make(map[string]bool)
		for _, t := range doc {
			if !seen[t] {
				df[t]++
				seen[t] = true
			}
		}
	}

	idf := make(map[string]float64)
	for term, freq := range df {
		idf[term] = math.Log((N-float64(freq)+0.5)/(float64(freq)+0.5) + 1)
	}
	return idf
}

var tokenRe = regexp.MustCompile(`[A-Z][a-z]+|[a-z]+|[A-Z]+(?:[A-Z][a-z]+)*|\d+`)

var camelSplitRe = regexp.MustCompile(`([a-z0-9])([A-Z])|([A-Z]+)([A-Z][a-z])`)

func tokenize(text string) []string {
	if strings.ContainsAny(text, "_-.") {
		tokens := tokenizeSeparated(text)
		if len(tokens) == 0 {
			return []string{}
		}
		return tokens
	}
	tokens := tokenizeCamel(text)
	if len(tokens) == 0 {
		return []string{}
	}
	return tokens
}

func tokenizeCamel(text string) []string {
	split := camelSplitRe.ReplaceAllString(text, `$1$3 $2$4`)
	var tokens []string
	for _, m := range tokenRe.FindAllString(split, -1) {
		t := strings.ToLower(m)
		if len(t) >= 2 && !isStopWord(t) {
			tokens = append(tokens, t)
		}
	}
	for _, t := range strings.Fields(strings.ToLower(split)) {
		if len(t) >= 2 && !isStopWord(t) {
			tokens = append(tokens, t)
		}
	}
	return uniqueTokens(tokens)
}

func uniqueTokens(tokens []string) []string {
	seen := make(map[string]bool)
	out := make([]string, 0, len(tokens))
	for _, t := range tokens {
		if seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
}

func tokenizeSeparated(text string) []string {
	seen := make(map[string]bool)
	var tokens []string
	add := func(t string) {
		t = strings.ToLower(strings.TrimSpace(t))
		if len(t) < 2 || isStopWord(t) || seen[t] {
			return
		}
		seen[t] = true
		tokens = append(tokens, t)
	}

	lower := strings.ToLower(text)
	lower = strings.NewReplacer(
		"_", " ", "-", " ", ".", " ", "/", " ", "(", " ", ")", " ",
		"{", " ", "}", " ", "[", " ", "]", " ", ";", " ", ":", " ",
	).Replace(lower)
	for _, t := range strings.Fields(lower) {
		add(t)
	}
	return tokens
}

var stopWords = map[string]bool{
	"the": true, "a": true, "an": true, "is": true, "it": true,
	"in": true, "on": true, "at": true, "to": true, "for": true,
	"of": true, "and": true, "or": true, "but": true, "not": true,
	"with": true, "this": true, "that": true, "be": true, "as": true,
	"return": true, "func": true, "var": true, "const": true,
	"if": true, "else": true, "import": true,
}

func isStopWord(t string) bool { return stopWords[t] }
