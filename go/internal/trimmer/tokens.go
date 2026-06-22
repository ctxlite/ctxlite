package trimmer

import (
	"encoding/json"
	"strings"
)

// UsageAnthropic matches Anthropic API response usage field.
type UsageAnthropic struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// UsageOpenAI matches OpenAI API response usage field.
type UsageOpenAI struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// TokenUsage holds normalized token counts from any API response.
type TokenUsage struct {
	InputTokens  int
	OutputTokens int
	TotalTokens  int
}

// ParseTokenUsage extracts token counts from an API response body.
func ParseTokenUsage(responseBody []byte) TokenUsage {
	var anthropic struct {
		Usage UsageAnthropic `json:"usage"`
	}
	if err := json.Unmarshal(responseBody, &anthropic); err == nil {
		if anthropic.Usage.InputTokens > 0 || anthropic.Usage.OutputTokens > 0 {
			return TokenUsage{
				InputTokens:  anthropic.Usage.InputTokens,
				OutputTokens: anthropic.Usage.OutputTokens,
				TotalTokens:  anthropic.Usage.InputTokens + anthropic.Usage.OutputTokens,
			}
		}
	}

	var openai struct {
		Usage UsageOpenAI `json:"usage"`
	}
	if err := json.Unmarshal(responseBody, &openai); err == nil {
		if openai.Usage.TotalTokens > 0 {
			return TokenUsage{
				InputTokens:  openai.Usage.PromptTokens,
				OutputTokens: openai.Usage.CompletionTokens,
				TotalTokens:  openai.Usage.TotalTokens,
			}
		}
	}

	return TokenUsage{}
}

// ParseStreamTokenUsage extracts token usage from SSE event lines.
func ParseStreamTokenUsage(events []string) TokenUsage {
	for i := len(events) - 1; i >= 0; i-- {
		line := events[i]
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			continue
		}

		usage := ParseTokenUsage([]byte(data))
		if usage.TotalTokens > 0 {
			return usage
		}
	}
	return TokenUsage{}
}

// EstimateTokens gives a rough estimate when no usage data is available.
func EstimateTokens(text []byte) int {
	if len(text) == 0 {
		return 0
	}
	return len(text) / 4
}
