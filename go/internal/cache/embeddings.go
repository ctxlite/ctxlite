package cache

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"
)

// EmbeddingProvider defines how to generate vector embeddings.
type EmbeddingProvider interface {
	Embed(ctx context.Context, text string) ([]float32, error)
	Dimensions() int
}

// OpenAIEmbedding calls an OpenAI-compatible /v1/embeddings endpoint.
type OpenAIEmbedding struct {
	BaseURL string
	APIKey  string
	Model   string
	dims    int
	client  *http.Client
}

// NewOpenAIEmbedding creates an OpenAI-compatible embedding provider.
func NewOpenAIEmbedding(baseURL, apiKey, model string) *OpenAIEmbedding {
	if model == "" {
		model = "text-embedding-3-small"
	}
	return &OpenAIEmbedding{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Model:   model,
		dims:    1536,
		client:  &http.Client{Timeout: 120 * time.Second},
	}
}

func (e *OpenAIEmbedding) Embed(ctx context.Context, text string) ([]float32, error) {
	payload := map[string]interface{}{
		"model": e.Model,
		"input": text,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("embedding marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		e.BaseURL+"/v1/embeddings",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+e.APIKey)

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embedding request: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("embedding decode: %w", err)
	}
	if len(result.Data) == 0 {
		return nil, fmt.Errorf("empty embedding response")
	}

	return result.Data[0].Embedding, nil
}

func (e *OpenAIEmbedding) Dimensions() int { return e.dims }

// HashEmbedding generates deterministic pseudo-embeddings using SHA256.
// Useful for tests and local development without an API key.
type HashEmbedding struct{}

func (h *HashEmbedding) Embed(_ context.Context, text string) ([]float32, error) {
	hash := sha256.Sum256([]byte(text))
	dims := h.Dimensions()
	vec := make([]float32, dims)
	for i := 0; i < dims; i++ {
		vec[i] = float32(hash[i%32]) / 255.0
	}
	return normalize(vec), nil
}

func (h *HashEmbedding) Dimensions() int { return 128 }

func normalize(v []float32) []float32 {
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	norm := float32(math.Sqrt(sum))
	if norm == 0 {
		return v
	}
	out := make([]float32, len(v))
	for i, x := range v {
		out[i] = x / norm
	}
	return out
}
