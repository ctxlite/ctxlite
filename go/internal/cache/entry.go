package cache

import (
	"encoding/json"
	"net/http"
	"time"
)

// Entry holds a cached API response.
type Entry struct {
	StatusCode  int         `json:"status_code"`
	Headers     http.Header `json:"headers"`
	Body        []byte      `json:"body"`
	CachedAt    time.Time   `json:"cached_at"`
	RequestHash string      `json:"request_hash"`
}

var sensitiveHeaders = map[string]bool{
	"Authorization": true,
	"X-Api-Key":     true,
	"X-Auth-Token":  true,
	"Cookie":        true,
}

// SanitizeHeaders removes authentication and session headers before caching.
func SanitizeHeaders(h http.Header) http.Header {
	out := h.Clone()
	for k := range sensitiveHeaders {
		out.Del(k)
	}
	return out
}

func (e *Entry) serialize() ([]byte, error) {
	return json.Marshal(e)
}

func deserialize(data []byte) (*Entry, error) {
	var e Entry
	if err := json.Unmarshal(data, &e); err != nil {
		return nil, err
	}
	return &e, nil
}
