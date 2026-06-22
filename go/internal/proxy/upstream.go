package proxy

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Upstream represents the destination of a proxied request.
type Upstream struct {
	Name    string // destination host (e.g. "api.anthropic.com")
	BaseURL string // full URL (e.g. "https://api.anthropic.com")
}

var upstreamClient = &http.Client{
	Timeout: 120 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

// resolveUpstream determines the upstream from the request.
// Priority: ForceURL config override, then Host header pass-through.
func (p *Proxy) resolveUpstream(r *http.Request) (Upstream, error) {
	if p.config.Upstream.ForceURL != "" {
		host := extractHost(p.config.Upstream.ForceURL)
		return Upstream{Name: host, BaseURL: p.config.Upstream.ForceURL}, nil
	}

	host := r.Host
	if host == "" {
		host = r.URL.Host
	}
	if host == "" {
		return Upstream{}, fmt.Errorf("proxy: cannot determine upstream — Host header missing")
	}

	scheme := "https"
	if isLocalhost(host) {
		scheme = "http"
	}

	baseURL := scheme + "://" + host
	return Upstream{Name: host, BaseURL: baseURL}, nil
}

func isLocalhost(host string) bool {
	h := host
	if strings.HasPrefix(h, "[") {
		if end := strings.Index(h, "]"); end != -1 {
			h = h[1:end]
		}
	} else if idx := strings.LastIndex(h, ":"); idx != -1 && strings.Count(h, ":") == 1 {
		h = h[:idx]
	}
	return h == "localhost" || h == "127.0.0.1" || h == "::1"
}

func extractHost(rawURL string) string {
	rawURL = strings.TrimPrefix(rawURL, "https://")
	rawURL = strings.TrimPrefix(rawURL, "http://")
	if idx := strings.Index(rawURL, "/"); idx != -1 {
		return rawURL[:idx]
	}
	return rawURL
}

func (p *Proxy) detectStreamAndForward(
	r *http.Request,
	upstream Upstream,
	body []byte,
) (isStream bool, streamResp *http.Response, respBody []byte, respHeaders http.Header, statusCode int, err error) {
	req, err := p.buildUpstreamRequest(r, upstream, body)
	if err != nil {
		return false, nil, nil, nil, 0, err
	}

	resp, err := upstreamClient.Do(req)
	if err != nil {
		return false, nil, nil, nil, 0, fmt.Errorf("upstream %s: %w", upstream.Name, err)
	}

	if isStreamingResponse(resp) {
		return true, resp, nil, nil, 0, nil
	}

	defer resp.Body.Close()

	respBody, err = io.ReadAll(io.LimitReader(resp.Body, 50*1024*1024))
	if err != nil {
		return false, nil, nil, nil, 0, fmt.Errorf("read upstream response: %w", err)
	}

	return false, nil, respBody, resp.Header, resp.StatusCode, nil
}

func (p *Proxy) buildUpstreamRequest(r *http.Request, upstream Upstream, body []byte) (*http.Request, error) {
	targetURL := upstream.BaseURL + r.URL.RequestURI()

	req, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build upstream request: %w", err)
	}

	copyHeaders(req.Header, r.Header)
	req.Host = upstream.Name

	return req, nil
}

func isStreamingResponse(resp *http.Response) bool {
	return strings.Contains(resp.Header.Get("Content-Type"), "text/event-stream")
}

func copyHeaders(dst, src http.Header) {
	hopByHop := map[string]bool{
		"Connection":          true,
		"Keep-Alive":          true,
		"Proxy-Authenticate":  true,
		"Proxy-Authorization": true,
		"Te":                  true,
		"Trailers":            true,
		"Transfer-Encoding":   true,
		"Upgrade":             true,
	}
	for k, vv := range src {
		if hopByHop[k] {
			continue
		}
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
}
