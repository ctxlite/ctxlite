// Package cache implements a two-level response cache for LLM API requests.
//
// L1 uses SHA256 exact matching on normalized request bodies.
// L2 uses cosine similarity search via sqlite-vec when an embedding provider
// is configured. Authentication headers are never stored in cache entries.
package cache
