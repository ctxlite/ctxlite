package trimmer

import "sort"

// SelectionResult holds the output of file selection.
type SelectionResult struct {
	Selected    []CodeFile
	TokensUsed  int
	TokensSaved int
	TrimRatio   float64
}

// SelectFiles picks the most relevant files within the token budget.
func SelectFiles(
	files []CodeFile,
	scores []ScoredDoc,
	importBoosts map[string]float64,
	maxTokens int,
	minScore float64,
) SelectionResult {
	totalTokens := 0
	for _, f := range files {
		totalTokens += f.Tokens
	}

	fileScores := make(map[string]float64)
	for _, sd := range scores {
		fileScores[files[sd.Index].Path] = sd.Score
	}
	for path, boost := range importBoosts {
		fileScores[path] += boost
	}

	type scoredFile struct {
		file  CodeFile
		score float64
	}
	scored := make([]scoredFile, len(files))
	for i, f := range files {
		scored[i] = scoredFile{file: f, score: fileScores[f.Path]}
	}
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	var selected []CodeFile
	tokensUsed := 0

	for _, sf := range scored {
		if sf.score < minScore {
			continue
		}
		if tokensUsed+sf.file.Tokens > maxTokens {
			continue
		}
		selected = append(selected, sf.file)
		tokensUsed += sf.file.Tokens
	}

	tokensSaved := totalTokens - tokensUsed
	trimRatio := 0.0
	if totalTokens > 0 {
		trimRatio = float64(tokensSaved) / float64(totalTokens)
	}

	return SelectionResult{
		Selected:    selected,
		TokensUsed:  tokensUsed,
		TokensSaved: tokensSaved,
		TrimRatio:   trimRatio,
	}
}
