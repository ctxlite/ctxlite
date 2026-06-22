package trimmer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// APIFormat identifies the upstream API format.
type APIFormat int

const (
	FormatUnknown APIFormat = iota
	FormatAnthropic
	FormatOpenAI
)

// ParsedRequest holds extracted data from an API request body.
type ParsedRequest struct {
	Format APIFormat
	Query  string
	Files  []CodeFile
	Raw    []byte
}

// CodeFile represents a file extracted from the request context.
type CodeFile struct {
	Path     string
	Content  string
	Language string
	Tokens   int
}

var codeBlockRe = regexp.MustCompile("(?s)```(\\w*)\\n(?://\\s*(?:File:\\s*)?([^\\n]+)\\n)?(.*?)```")

type anthropicMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
}

type anthropicContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type openAIMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
}

// Parse extracts query and files from an API request body.
func Parse(body []byte) (ParsedRequest, error) {
	var probe struct {
		Messages []json.RawMessage `json:"messages"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return ParsedRequest{Raw: body}, fmt.Errorf("parse: unmarshal: %w", err)
	}

	format := detectFormat(body)
	switch format {
	case FormatAnthropic:
		return parseAnthropic(body)
	case FormatOpenAI:
		return parseOpenAI(body)
	default:
		return ParsedRequest{Raw: body, Format: FormatUnknown}, nil
	}
}

func detectFormat(body []byte) APIFormat {
	if bytes.Contains(body, []byte(`"anthropic_version"`)) {
		return FormatAnthropic
	}

	var probe struct {
		Messages []struct {
			Content json.RawMessage `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return FormatUnknown
	}

	for _, msg := range probe.Messages {
		if len(msg.Content) == 0 {
			continue
		}
		switch msg.Content[0] {
		case '[':
			var blocks []struct {
				Type string `json:"type"`
			}
			if err := json.Unmarshal(msg.Content, &blocks); err == nil && len(blocks) > 0 && blocks[0].Type != "" {
				return FormatAnthropic
			}
		case '"':
			return FormatOpenAI
		}
	}

	return FormatOpenAI
}

func parseAnthropic(body []byte) (ParsedRequest, error) {
	var root map[string]json.RawMessage
	if err := json.Unmarshal(body, &root); err != nil {
		return ParsedRequest{Raw: body}, err
	}

	var messages []anthropicMessage
	if err := json.Unmarshal(root["messages"], &messages); err != nil {
		return ParsedRequest{Raw: body, Format: FormatAnthropic}, err
	}

	parsed := ParsedRequest{
		Format: FormatAnthropic,
		Raw:    append([]byte(nil), body...),
	}

	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != "user" {
			continue
		}
		text := anthropicMessageText(messages[i])
		query := extractQuery(text)
		if query != "" {
			parsed.Query = query
			break
		}
	}

	seen := make(map[string]bool)
	for _, msg := range messages {
		if msg.Role != "user" {
			continue
		}
		for _, file := range extractCodeBlocks(anthropicMessageText(msg)) {
			if seen[file.Path] {
				continue
			}
			seen[file.Path] = true
			parsed.Files = append(parsed.Files, file)
		}
	}

	return parsed, nil
}

func parseOpenAI(body []byte) (ParsedRequest, error) {
	var root map[string]json.RawMessage
	if err := json.Unmarshal(body, &root); err != nil {
		return ParsedRequest{Raw: body}, err
	}

	var messages []openAIMessage
	if err := json.Unmarshal(root["messages"], &messages); err != nil {
		return ParsedRequest{Raw: body, Format: FormatOpenAI}, err
	}

	parsed := ParsedRequest{
		Format: FormatOpenAI,
		Raw:    append([]byte(nil), body...),
	}

	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != "user" {
			continue
		}
		text := openAIMessageText(messages[i])
		query := extractQuery(text)
		if query != "" {
			parsed.Query = query
			break
		}
	}

	seen := make(map[string]bool)
	for _, msg := range messages {
		if msg.Role != "user" {
			continue
		}
		for _, file := range extractCodeBlocks(openAIMessageText(msg)) {
			if seen[file.Path] {
				continue
			}
			seen[file.Path] = true
			parsed.Files = append(parsed.Files, file)
		}
	}

	return parsed, nil
}

func anthropicMessageText(msg anthropicMessage) string {
	var blocks []anthropicContentBlock
	if err := json.Unmarshal(msg.Content, &blocks); err == nil && len(blocks) > 0 {
		var parts []string
		for _, block := range blocks {
			if block.Type == "text" {
				parts = append(parts, block.Text)
			}
		}
		return strings.Join(parts, "\n")
	}

	var text string
	if err := json.Unmarshal(msg.Content, &text); err == nil {
		return text
	}
	return ""
}

func openAIMessageText(msg openAIMessage) string {
	var text string
	if err := json.Unmarshal(msg.Content, &text); err == nil {
		return text
	}

	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(msg.Content, &parts); err == nil {
		var texts []string
		for _, part := range parts {
			if part.Type == "text" {
				texts = append(texts, part.Text)
			}
		}
		return strings.Join(texts, "\n")
	}
	return ""
}

func extractCodeBlocks(text string) []CodeFile {
	matches := codeBlockRe.FindAllStringSubmatch(text, -1)
	var files []CodeFile
	for _, m := range matches {
		lang := m[1]
		path := strings.TrimSpace(m[2])
		content := m[3]

		if path == "" {
			path = fmt.Sprintf("snippet_%d.%s", len(files), lang)
		}

		file := CodeFile{
			Path:     path,
			Content:  content,
			Language: lang,
			Tokens:   EstimateTokens([]byte(content)),
		}
		files = append(files, file)
	}
	return files
}

func extractQuery(text string) string {
	clean := codeBlockRe.ReplaceAllString(text, "")
	return strings.TrimSpace(clean)
}

func formatCodeBlock(f CodeFile) string {
	lang := f.Language
	if lang == "" {
		lang = "text"
	}
	return fmt.Sprintf("```%s\n// File: %s\n%s```", lang, f.Path, strings.TrimRight(f.Content, "\n"))
}

func rebuildAnthropic(parsed ParsedRequest, selected []CodeFile) ([]byte, error) {
	var root map[string]json.RawMessage
	if err := json.Unmarshal(parsed.Raw, &root); err != nil {
		return nil, err
	}

	var messages []anthropicMessage
	if err := json.Unmarshal(root["messages"], &messages); err != nil {
		return nil, err
	}

	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != "user" {
			continue
		}
		if len(extractCodeBlocks(anthropicMessageText(messages[i]))) == 0 {
			continue
		}
		messages[i].Content = marshalAnthropicContent(parsed.Query, selected)
		break
	}

	updated, err := json.Marshal(messages)
	if err != nil {
		return nil, err
	}
	root["messages"] = updated
	return json.Marshal(root)
}

func rebuildOpenAI(parsed ParsedRequest, selected []CodeFile) ([]byte, error) {
	var root map[string]json.RawMessage
	if err := json.Unmarshal(parsed.Raw, &root); err != nil {
		return nil, err
	}

	var messages []openAIMessage
	if err := json.Unmarshal(root["messages"], &messages); err != nil {
		return nil, err
	}

	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != "user" {
			continue
		}
		if len(extractCodeBlocks(openAIMessageText(messages[i]))) == 0 {
			continue
		}
		content := parsed.Query
		for _, f := range selected {
			if content != "" {
				content += "\n\n"
			}
			content += formatCodeBlock(f)
		}
		encoded, err := json.Marshal(content)
		if err != nil {
			return nil, err
		}
		messages[i].Content = encoded
		break
	}

	updated, err := json.Marshal(messages)
	if err != nil {
		return nil, err
	}
	root["messages"] = updated
	return json.Marshal(root)
}

func marshalAnthropicContent(query string, selected []CodeFile) json.RawMessage {
	var blocks []anthropicContentBlock
	if query != "" {
		blocks = append(blocks, anthropicContentBlock{Type: "text", Text: query})
	}
	for _, f := range selected {
		blocks = append(blocks, anthropicContentBlock{Type: "text", Text: formatCodeBlock(f)})
	}
	data, err := json.Marshal(blocks)
	if err != nil {
		return json.RawMessage("[]")
	}
	return data
}
