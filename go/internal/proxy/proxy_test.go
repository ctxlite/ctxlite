package proxy

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/ctxlite/ctxlite/go/internal/stats"
)

func testProxy(t *testing.T, cfg Config) (*Proxy, int) {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen error = %v", err)
	}

	port := listener.Addr().(*net.TCPAddr).Port
	cfg.Port = port

	p, err := New(cfg)
	if err != nil {
		listener.Close()
		t.Fatalf("New() error = %v", err)
	}

	p.server.Addr = listener.Addr().String()
	go func() {
		_ = p.server.Serve(listener)
	}()

	return p, port
}

func TestCopyHeaders_ExcludesHopByHop(t *testing.T) {
	src := http.Header{}
	src.Set("Authorization", "Bearer sk-test")
	src.Set("Content-Type", "application/json")
	src.Set("Connection", "keep-alive")
	src.Set("Transfer-Encoding", "chunked")

	dst := http.Header{}
	copyHeaders(dst, src)

	if dst.Get("Authorization") == "" {
		t.Error("Authorization missing")
	}
	if dst.Get("Content-Type") == "" {
		t.Error("Content-Type missing")
	}
	if dst.Get("Connection") != "" {
		t.Error("Connection should be excluded")
	}
	if dst.Get("Transfer-Encoding") != "" {
		t.Error("Transfer-Encoding should be excluded")
	}
}

func TestProxy_NonStream(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" {
			t.Errorf("upstream path = %q, want /v1/messages", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sk-test" {
			t.Errorf("Authorization = %q, want Bearer sk-test", got)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"test","content":[{"text":"hello"}]}`))
	}))
	defer mock.Close()

	store, err := stats.New(":memory:")
	if err != nil {
		t.Fatalf("stats.New() error = %v", err)
	}
	defer store.Close()

	p, port := testProxy(t, Config{
		Store: store,
		Upstream: UpstreamConfig{
			ForceURL: mock.URL,
		},
	})
	defer p.Stop()

	time.Sleep(50 * time.Millisecond)

	req, err := http.NewRequest(
		http.MethodPost,
		"http://127.0.0.1:"+strconv.Itoa(port)+"/v1/messages",
		strings.NewReader(`{"model":"claude-3","messages":[]}`),
	)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer sk-test")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("want 200, got %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), "hello") {
		t.Errorf("body = %q, want hello", body)
	}

	summary := store.SessionSummary()
	if summary.TotalRequests != 1 {
		t.Errorf("TotalRequests = %d, want 1", summary.TotalRequests)
	}
}

func TestProxy_BindsOnLoopback(t *testing.T) {
	store, err := stats.New(":memory:")
	if err != nil {
		t.Fatalf("stats.New() error = %v", err)
	}
	defer store.Close()

	p, err := New(Config{Port: 18081, Store: store})
	if err != nil {
		t.Fatal(err)
	}

	if !strings.HasPrefix(p.Addr(), "127.0.0.1:") {
		t.Errorf("proxy must bind on loopback, got: %s", p.Addr())
	}
}

func TestProxy_MissingContentType(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer mock.Close()

	store, err := stats.New(":memory:")
	if err != nil {
		t.Fatalf("stats.New() error = %v", err)
	}
	defer store.Close()

	p, port := testProxy(t, Config{
		Store: store,
		Upstream: UpstreamConfig{
			ForceURL: mock.URL,
		},
	})
	defer p.Stop()

	time.Sleep(50 * time.Millisecond)

	req, err := http.NewRequest(
		http.MethodPost,
		"http://127.0.0.1:"+strconv.Itoa(port)+"/v1/messages",
		strings.NewReader("{}"),
	)
	if err != nil {
		t.Fatal(err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("want 400, got %d", resp.StatusCode)
	}
}

func TestProxy_Stream(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		_, _ = w.Write([]byte("data: {\"type\":\"message_start\"}\n\n"))
		flusher.Flush()
		_, _ = w.Write([]byte("data: {\"type\":\"message_stop\"}\n\n"))
		flusher.Flush()
	}))
	defer mock.Close()

	store, err := stats.New(":memory:")
	if err != nil {
		t.Fatalf("stats.New() error = %v", err)
	}
	defer store.Close()

	p, port := testProxy(t, Config{
		Store: store,
		Upstream: UpstreamConfig{
			ForceURL: mock.URL,
		},
	})
	defer p.Stop()

	time.Sleep(50 * time.Millisecond)

	req, err := http.NewRequest(
		http.MethodPost,
		"http://127.0.0.1:"+strconv.Itoa(port)+"/v1/messages",
		strings.NewReader(`{"model":"claude-3","messages":[],"stream":true}`),
	)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("want 200, got %d", resp.StatusCode)
	}
	if !strings.Contains(resp.Header.Get("Content-Type"), "text/event-stream") {
		t.Errorf("content-type = %q", resp.Header.Get("Content-Type"))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), "message_start") {
		t.Errorf("body = %q, want streamed events", body)
	}
}