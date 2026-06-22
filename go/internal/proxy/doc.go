// Package proxy implements an HTTP reverse proxy that intercepts LLM API calls,
// applies caching and context trimming, then forwards cache misses to the
// upstream resolved from the request Host header.
//
// The proxy binds exclusively to 127.0.0.1 and never stores
// authentication credentials.
package proxy
