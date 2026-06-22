// Package trimmer reduces LLM request context by scoring code files with BM25,
// boosting import graph neighbors, and selecting files within a token budget.
package trimmer
