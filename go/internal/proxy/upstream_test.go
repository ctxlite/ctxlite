package proxy

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResolveUpstream_FromHostHeader(t *testing.T) {
	p := &Proxy{config: Config{}}

	cases := []struct {
		host     string
		wantBase string
	}{
		{"api.anthropic.com", "https://api.anthropic.com"},
		{"api.openai.com", "https://api.openai.com"},
		{"api2.cursor.sh", "https://api2.cursor.sh"},
		{"api.githubcopilot.com", "https://api.githubcopilot.com"},
		{"localhost:11434", "http://localhost:11434"},
		{"127.0.0.1:8000", "http://127.0.0.1:8000"},
		{"custom.internal.corp:443", "https://custom.internal.corp:443"},
		{"api.some-unknown-provider.com", "https://api.some-unknown-provider.com"},
	}

	for _, tc := range cases {
		t.Run(tc.host, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
			r.Host = tc.host

			upstream, err := p.resolveUpstream(r)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if upstream.BaseURL != tc.wantBase {
				t.Errorf("got BaseURL %q, want %q", upstream.BaseURL, tc.wantBase)
			}
		})
	}
}

func TestResolveUpstream_ForceURL(t *testing.T) {
	p := &Proxy{config: Config{
		Upstream: UpstreamConfig{ForceURL: "http://localhost:9999"},
	}}

	r := httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	r.Host = "api.anthropic.com"

	upstream, err := p.resolveUpstream(r)
	if err != nil {
		t.Fatal(err)
	}

	if upstream.BaseURL != "http://localhost:9999" {
		t.Errorf("ForceURL not respected: got %s", upstream.BaseURL)
	}
}

func TestResolveUpstream_MissingHost_ReturnsError(t *testing.T) {
	p := &Proxy{config: Config{}}

	r := httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	r.Host = ""
	r.URL.Host = ""

	_, err := p.resolveUpstream(r)
	if err == nil {
		t.Error("expected error when Host header is missing")
	}
}

func TestForward_SetsCorrectHostHeader(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("Authorization = %q, want Bearer test-key", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"usage":{"input_tokens":10,"output_tokens":5}}`))
	}))
	defer mock.Close()

	p := &Proxy{config: Config{
		Upstream: UpstreamConfig{ForceURL: mock.URL},
	}}

	r := httptest.NewRequest(http.MethodPost, "/v1/messages", strings.NewReader(`{}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer test-key")
	r.Host = "api.anthropic.com"

	upstream, err := p.resolveUpstream(r)
	if err != nil {
		t.Fatal(err)
	}

	_, _, _, _, _, err = p.detectStreamAndForward(r, upstream, []byte(`{}`))
	if err != nil {
		t.Fatalf("forward error: %v", err)
	}
}

func TestIsLocalhost(t *testing.T) {
	cases := []struct {
		host string
		want bool
	}{
		{"localhost", true},
		{"localhost:11434", true},
		{"127.0.0.1", true},
		{"127.0.0.1:8000", true},
		{"::1", true},
		{"api.openai.com", false},
		{"192.168.1.1", false},
		{"10.0.0.1", false},
	}
	for _, tc := range cases {
		t.Run(tc.host, func(t *testing.T) {
			if got := isLocalhost(tc.host); got != tc.want {
				t.Errorf("isLocalhost(%q) = %v, want %v", tc.host, got, tc.want)
			}
		})
	}
}
