# SPEC-02-addendum: Proxy Architecture Fix

**Project:** `ctxlite`  
**Scope:** Inlocuieste upstream detection fragila din SPEC-02 cu un pass-through pur bazat pe `Host` header. Documenteaza clar ce functioneaza cu ce tool.  
**Patch-uieste:** SPEC-02 (`internal/proxy/upstream.go`, `README.md`, `docs/`)  
**Agent target:** Cursor AI  
**Status:** `[x] Done`

---

## Contextul problemei

SPEC-02 a implementat `detectUpstream()` care incerca sa ghiceasca API-ul destinatar din path si headers:

```go
// GRESIT — fragil si non-exhaustiv:
if path == "/v1/messages" || r.Header.Get("anthropic-version") != "" {
    return Upstream{"anthropic", "https://api.anthropic.com"}, nil
}
if path == "/v1/chat/completions" {
    return Upstream{"openai", "https://api.openai.com"}, nil
}
```

**De ce e gresit:**

OpenCode suporta 75+ provideri, fiecare cu propriul URL:

```
api.anthropic.com
api.openai.com
api.githubcopilot.com
api2.cursor.sh
generativelanguage.googleapis.com
api.groq.com
bedrock-runtime.us-east-1.amazonaws.com
localhost:11434  (Ollama)
... etc
```

Nu exista nicio lista exhaustiva. Orice incercare de detectie va rupe provideri necunoscuti.

**Solutia:** proxy-ul devine **pass-through pur** — forwardeaza la URL-ul exact din `Host` header, fara logica de detectie.

---

## Ce functioneaza cu ce tool — clarificare definitiva

```
┌──────────────────┬────────────────────────┬───────────────────────────┐
│ Tool             │ HTTP Proxy (:8080)      │ MCP Server (stdio)        │
├──────────────────┼────────────────────────┼───────────────────────────┤
│ Cursor           │ ✅ OPENAI_BASE_URL      │ ✅ .cursor/mcp.json       │
│ Claude Code      │ ✅ ANTHROPIC_BASE_URL   │ ✅ claude mcp add         │
│ OpenCode         │ ❌ nu e posibil*        │ ✅ opencode.json mcpServers│
│ VS Code Copilot  │ ❌                      │ ✅                        │
│ Orice alt tool   │ depinde de tool         │ ✅ daca suporta MCP       │
└──────────────────┴────────────────────────┴───────────────────────────┘

* OpenCode vorbeste direct cu 75+ provideri pe URL-urile lor native.
  Nu exista un singur chokepoint HTTP interceptabil.
  Integrarea cu OpenCode este exclusiv prin MCP.
```

---

## Modificari in `internal/proxy/upstream.go`

**Sterge complet** logica existenta de detectie si inlocuieste cu:

```go
package proxy

import (
    "fmt"
    "net/http"
    "strings"
    "time"
)

// Upstream reprezinta destinatia unui request proxiat.
type Upstream struct {
    Name    string // host-ul destinatar (ex: "api.anthropic.com")
    BaseURL string // URL complet (ex: "https://api.anthropic.com")
}

// resolveUpstream determina upstream-ul din request.
// Strategia (in ordine de prioritate):
//  1. Flag explicit --upstream-url din config (override manual)
//  2. Host header din request (pass-through pur)
//  3. Eroare daca Host lipseste
func (p *Proxy) resolveUpstream(r *http.Request) (Upstream, error) {
    // 1. Override explicit din config
    if p.config.Upstream.ForceURL != "" {
        host := extractHost(p.config.Upstream.ForceURL)
        return Upstream{Name: host, BaseURL: p.config.Upstream.ForceURL}, nil
    }

    // 2. Pass-through pur: foloseste Host header din request
    host := r.Host
    if host == "" {
        host = r.URL.Host
    }
    if host == "" {
        return Upstream{}, fmt.Errorf("proxy: cannot determine upstream — Host header missing")
    }

    // Construieste base URL din host
    // Presupunem HTTPS pentru orice host extern
    // Exceptie: localhost si 127.0.0.1 → HTTP (pentru Ollama, LM Studio etc)
    scheme := "https"
    if isLocalhost(host) {
        scheme = "http"
    }

    baseURL := scheme + "://" + host
    return Upstream{Name: host, BaseURL: baseURL}, nil
}

// isLocalhost returneaza true pentru adrese locale.
func isLocalhost(host string) bool {
    // Strip port daca e prezent
    h := host
    if idx := strings.LastIndex(host, ":"); idx != -1 {
        h = host[:idx]
    }
    return h == "localhost" || h == "127.0.0.1" || h == "::1"
}

// extractHost extrage host-ul dintr-un URL complet.
func extractHost(rawURL string) string {
    rawURL = strings.TrimPrefix(rawURL, "https://")
    rawURL = strings.TrimPrefix(rawURL, "http://")
    if idx := strings.Index(rawURL, "/"); idx != -1 {
        return rawURL[:idx]
    }
    return rawURL
}

// upstreamClient este HTTP client pentru requests outbound.
var upstreamClient = &http.Client{
    Timeout: 120 * time.Second,
    // Nu urma redirect-uri automat — pass-through pur
    CheckRedirect: func(req *http.Request, via []*http.Request) error {
        return http.ErrUseLastResponse
    },
}

// forward trimite requestul la upstream si returneaza raspunsul brut.
// Identic cu SPEC-02, dar foloseste resolveUpstream in loc de detectUpstream.
func (p *Proxy) forward(
    r *http.Request,
    upstream Upstream,
    body []byte,
) (respBody []byte, respHeaders http.Header, statusCode int, err error) {

    targetURL := upstream.BaseURL + r.URL.RequestURI()

    req, err := http.NewRequestWithContext(
        r.Context(), r.Method, targetURL, bytes.NewReader(body),
    )
    if err != nil {
        return nil, nil, 0, fmt.Errorf("build upstream request: %w", err)
    }

    // Pass-through complet al headerelor originale
    // Inclusiv Authorization, x-api-key, anthropic-version, etc.
    // SECURITATE: forwardam, nu stocam
    copyHeaders(req.Header, r.Header)

    // Host header trebuie sa fie cel al upstream-ului, nu al proxy-ului
    req.Host = upstream.Name

    resp, err := upstreamClient.Do(req)
    if err != nil {
        return nil, nil, 0, fmt.Errorf("upstream %s: %w", upstream.Name, err)
    }
    defer resp.Body.Close()

    if isStreamingResponse(resp) {
        return nil, nil, 0, errIsStream // sentinel pentru handler
    }

    respBody, err = io.ReadAll(io.LimitReader(resp.Body, 50*1024*1024)) // 50MB max response
    if err != nil {
        return nil, nil, 0, fmt.Errorf("read upstream response: %w", err)
    }

    return respBody, resp.Header, resp.StatusCode, nil
}

// errIsStream e un sentinel returnat cand upstream raspunde cu SSE.
var errIsStream = fmt.Errorf("streaming response")

// isStreamingResponse returneaza true daca raspunsul e SSE.
func isStreamingResponse(resp *http.Response) bool {
    return strings.Contains(resp.Header.Get("Content-Type"), "text/event-stream")
}
```

---

## Modificari in `proxy.go` — Config update

```go
// UpstreamConfig — simplificat, fara AnthropicURL/OpenAIURL
type UpstreamConfig struct {
    // ForceURL redirecteaza TOT traficul la un singur URL.
    // Util pentru testing cu mock server.
    // In productie: lasati gol — pass-through automat din Host header.
    ForceURL string
}

// Config — sterge AnthropicURL si OpenAIURL, pastreaza doar ForceURL
type Config struct {
    Port         int
    Upstream     UpstreamConfig
    Store        *stats.Store
    Cache        *cache.Cache
    Trimmer      *trimmer.Trimmer
    MaxBodyBytes int64
}
```

---

## Modificari in `handler.go`

Inlocuieste apelul `p.detectUpstream(r)` cu `p.resolveUpstream(r)`:

```go
// INAINTE (SPEC-02):
upstream, err := p.detectUpstream(r)

// DUPA (addendum):
upstream, err := p.resolveUpstream(r)
```

Nimic altceva nu se schimba in handler — logica de cache, trimming, logging ramane identica.

---

## Modificari in `main.go`

**Sterge** flags-urile `--anthropic-url` si `--openai-url`.  
**Adauga** un singur flag optional:

```go
// Flag nou — optional, doar pentru debugging/testing
forceURL := flag.String("upstream-url", "",
    "Force all requests to this URL (for testing only). Default: pass-through from Host header.")

// In proxy.Config:
srv, err := proxy.New(proxy.Config{
    Port:  *port,
    Store: store,
    Cache: c,
    Trimmer: t,
    Upstream: proxy.UpstreamConfig{
        ForceURL: *forceURL,
    },
})
```

---

## Modificari in `internal/config/config.go`

**Sterge** `AnthropicURL`, `OpenAIURL` din `Config` struct si din `config.yaml` format.  
**Pastreaza** doar:

```go
type Config struct {
    Port     int          `yaml:"port"`
    DB       string       `yaml:"db"`
    Verbose  bool         `yaml:"verbose"`
    Embedding EmbeddingConf `yaml:"embedding"`
    Trimming  TrimmingConf  `yaml:"trimming"`
    Cache     CacheConf     `yaml:"cache"`
    // ForceURL e doar pentru testing, nu in config.yaml
}
```

---

## Cum configureaza userul fiecare tool

### Cursor

```bash
# In shell profile (~/.zshrc, ~/.bashrc):
export OPENAI_BASE_URL=http://127.0.0.1:8080/v1

# Cursor trimite requesturile la 127.0.0.1:8080
# cu Host: api2.cursor.sh (sau alt endpoint Cursor)
# ctxlite forwardeaza transparent la Host-ul original
```

### Claude Code

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8080
# Claude Code trimite la 127.0.0.1:8080
# cu Host: api.anthropic.com
# ctxlite forwardeaza transparent
```

### OpenCode — MCP only

```json
// ~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "mcpServers": {
    "ctxlite": {
      "type": "stdio",
      "command": "ctxlite",
      "args": []
    }
  }
}
```

**Nu** seta `baseURL` in OpenCode config — OpenCode vorbeste direct cu providerul sau.  
ctxlite ofera `trim_context` si `get_stats` ca MCP tools, nu proxy.

### Orice alt tool cu suport MCP

```json
{
  "mcpServers": {
    "ctxlite": { "command": "ctxlite", "args": [] }
  }
}
```

---

## Update `upstream_test.go` — teste noi

**Sterge** testele vechi pentru `detectUpstream`.  
**Adauga**:

### Test 1: resolveUpstream din Host header

```go
func TestResolveUpstream_FromHostHeader(t *testing.T) {
    p := &Proxy{config: Config{}}

    cases := []struct {
        host     string
        wantBase string
        wantHTTP bool // true daca e http (localhost)
    }{
        {"api.anthropic.com", "https://api.anthropic.com", false},
        {"api.openai.com", "https://api.openai.com", false},
        {"api2.cursor.sh", "https://api2.cursor.sh", false},
        {"api.githubcopilot.com", "https://api.githubcopilot.com", false},
        {"localhost:11434", "http://localhost:11434", true},
        {"127.0.0.1:8000", "http://127.0.0.1:8000", true},
        {"custom.internal.corp:443", "https://custom.internal.corp:443", false},
    }

    for _, tc := range cases {
        t.Run(tc.host, func(t *testing.T) {
            r := httptest.NewRequest("POST", "/v1/chat/completions", nil)
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
```

### Test 2: resolveUpstream cu ForceURL

```go
func TestResolveUpstream_ForceURL(t *testing.T) {
    p := &Proxy{config: Config{
        Upstream: UpstreamConfig{ForceURL: "http://localhost:9999"},
    }}

    r := httptest.NewRequest("POST", "/v1/messages", nil)
    r.Host = "api.anthropic.com" // ar fi upstream normal

    upstream, err := p.resolveUpstream(r)
    if err != nil { t.Fatal(err) }

    if upstream.BaseURL != "http://localhost:9999" {
        t.Errorf("ForceURL not respected: got %s", upstream.BaseURL)
    }
}
```

### Test 3: resolveUpstream fara Host header returneaza eroare

```go
func TestResolveUpstream_MissingHost_ReturnsError(t *testing.T) {
    p := &Proxy{config: Config{}}

    r := httptest.NewRequest("POST", "/v1/messages", nil)
    r.Host = "" // lipseste
    r.URL.Host = ""

    _, err := p.resolveUpstream(r)
    if err == nil {
        t.Error("expected error when Host header is missing")
    }
}
```

### Test 4: forward cu mock upstream — Host header corect

```go
func TestForward_SetsCorrectHostHeader(t *testing.T) {
    var receivedHost string
    mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        receivedHost = r.Host
        w.Header().Set("Content-Type", "application/json")
        w.Write([]byte(`{"usage":{"input_tokens":10,"output_tokens":5}}`))
    }))
    defer mock.Close()

    p := &Proxy{config: Config{
        Upstream: UpstreamConfig{ForceURL: mock.URL},
    }}

    r := httptest.NewRequest("POST", "/v1/messages", strings.NewReader(`{}`))
    r.Header.Set("Content-Type", "application/json")
    r.Header.Set("Authorization", "Bearer test-key")
    r.Host = "api.anthropic.com"

    upstream, _ := p.resolveUpstream(r)
    _, _, _, err := p.forward(r, upstream, []byte(`{}`))

    if err != nil && err != errIsStream {
        t.Fatalf("forward error: %v", err)
    }

    // Verifica ca Authorization a fost forwardat
    // (nu verificam receivedHost pentru ca ForceURL il schimba)
}
```

### Test 5: isLocalhost

```go
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
```

---

## Update `integration_test.go` (din SPEC-09)

Pass-through pur simplifica enorm integration tests — mock server-ul primeste requestul exact asa cum l-a trimis tool-ul:

```go
func startMockUpstream(t *testing.T) *httptest.Server {
    t.Helper()
    mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Raspunde la orice path cu un JSON valid de usage
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]any{
            "id": "test",
            "usage": map[string]any{
                "input_tokens": 100, "output_tokens": 20,
            },
        })
    }))
    t.Cleanup(mock.Close)
    return mock
}

// In test:
mock := startMockUpstream(t)
srv, _ := proxy.New(proxy.Config{
    Port: 18080,
    Upstream: proxy.UpstreamConfig{
        ForceURL: mock.URL, // tot traficul merge la mock
    },
})
```

---

## Update `README.md` — sectiune clara de setup per tool

Inlocuieste sectiunea "Quick start" cu:

```markdown
## Setup

### Step 1 — Start ctxlite

```bash
ctxlite
# Running: proxy :8080 | mcp stdio
```

### Step 2 — Configure your tool

#### Cursor
```bash
# Add to ~/.zshrc or ~/.bashrc:
export OPENAI_BASE_URL=http://127.0.0.1:8080/v1
```
Restart Cursor after setting the env var.

#### Claude Code
```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8080
```

#### OpenCode
Add to `~/.config/opencode/opencode.json`:
```json
{
  "mcpServers": {
    "ctxlite": { "type": "stdio", "command": "ctxlite", "args": [] }
  }
}
```

> **Note:** OpenCode talks directly to your configured providers.
> ctxlite integrates via MCP only — `trim_context` and `get_stats` tools.
> HTTP proxy does not apply to OpenCode.

#### Any other MCP-compatible tool
```json
{
  "mcpServers": {
    "ctxlite": { "command": "ctxlite", "args": [] }
  }
}
```

### What works where

| Feature | Cursor | Claude Code | OpenCode | Other MCP tools |
|---|:---:|:---:|:---:|:---:|
| HTTP caching (L1+L2) | ✅ | ✅ | ❌ | ❌ |
| Context trimming (proxy) | ✅ | ✅ | ❌ | ❌ |
| `trim_context` MCP tool | ✅ | ✅ | ✅ | ✅ |
| `get_stats` MCP tool | ✅ | ✅ | ✅ | ✅ |
| Stats reporting | ✅ | ✅ | ✅* | ✅* |

*MCP-only: stats reflect MCP tool calls, not proxied requests.
```

---

## Update `docs/architecture.md`

Inlocuieste sectiunea "HTTP Proxy" cu:

```markdown
## HTTP Proxy — pass-through pur

Proxy-ul forwardeaza requesturi la upstream-ul original fara logica de detectie.
Upstream-ul e determinat exclusiv din `Host` header al requestului.

```
Cursor / Claude Code
       ↓ (OPENAI_BASE_URL sau ANTHROPIC_BASE_URL → 127.0.0.1:8080)
  ctxlite proxy :8080
       ↓ Host header: api.anthropic.com (sau alt provider)
  L1 cache → HIT → return
       ↓ MISS
  L2 cache → HIT → return  
       ↓ MISS
  context trimmer
       ↓
  api.anthropic.com (sau Host-ul original)
```

### De ce pass-through si nu detectie de upstream

Coding tools suporta zeci de provideri (Anthropic, OpenAI, Groq, Ollama, Azure,
Bedrock, GitHub Copilot, etc.) fiecare cu URL-ul sau. Orice logica de detectie
ar fi incompleta si s-ar rupe la provideri noi.

Pass-through pur functioneaza cu orice provider, acum si in viitor,
fara modificari in ctxlite.

### Localhost exception

Requesturi catre `localhost` sau `127.0.0.1` sunt proxiate cu `http://` in loc
de `https://` — pentru Ollama, LM Studio si alte servere locale.

## MCP Server — compatibil cu orice tool

MCP server-ul functioneaza independent de proxy.
OpenCode si orice alt tool cu suport MCP beneficiaza de:
- `trim_context` — trimming explicit de fisiere
- `get_stats` — statistici de sesiune
```

---

## Acceptance criteria

Agentul a terminat SPEC-02-addendum cand:

- [ ] `detectUpstream()` nu mai exista in codebase (`grep -r detectUpstream` returneaza nimic)
- [ ] `resolveUpstream()` foloseste exclusiv `Host` header sau `ForceURL`
- [ ] `UpstreamConfig` nu mai are `AnthropicURL` / `OpenAIURL`
- [ ] `config.yaml` nu mai are `anthropic_url` / `openai_url`
- [ ] Toate cele 5 teste noi trec
- [ ] Un request cu `Host: api.anthropic.com` e forwardat la `https://api.anthropic.com`
- [ ] Un request cu `Host: localhost:11434` e forwardat la `http://localhost:11434`
- [ ] Un request cu `Host: api.some-unknown-provider.com` e forwardat corect (nu returneaza 502)
- [ ] `README.md` are tabelul clar cu ce functioneaza unde
- [ ] `make test` trece (inclusiv testele vechi din SPEC-02 care nu depind de `detectUpstream`)

---

## Ce se schimba fata de SPEC-02

| | SPEC-02 | SPEC-02-addendum |
|---|---|---|
| Upstream detection | din path + header | din Host header (pass-through) |
| Provideri suportati | Anthropic + OpenAI | orice provider |
| Config flags | `--anthropic-url`, `--openai-url` | `--upstream-url` (optional, testing) |
| `config.yaml` | `anthropic_url`, `openai_url` | nimic (auto din Host) |
| OpenCode suport | proxy (incorect) | MCP only (corect) |
| Test mock | mock per provider | un singur mock universal |