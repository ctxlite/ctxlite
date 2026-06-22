CGO_ENABLED ?= 1
export CGO_ENABLED

.PHONY: build test lint clean run build-all ci npm-validate \
	release-build npm-stage npm-publish npm-version npm-install-local npm-pack

BINARY := ctxlite
GO_DIR := ./go/...
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null | sed 's/^v//' || echo "dev")
LDFLAGS := -ldflags="-s -w -X main.version=$(VERSION)"

build:
	go build $(LDFLAGS) -o bin/$(BINARY) ./go/cmd/ctxlite

run:
	go run ./go/cmd/ctxlite --verbose

test:
	go test $(GO_DIR) -v -race

lint:
	golangci-lint run $(GO_DIR)

clean:
	rm -rf bin/

ci: test lint npm-ci

npm-ci:
	@./scripts/ci.sh

npm-validate:
	@for pkg in npm/ctxlite npm/ctxlite-darwin-arm64 npm/ctxlite-darwin-x64 \
		npm/ctxlite-linux-x64 npm/ctxlite-linux-arm64 npm/ctxlite-win32-x64; do \
		echo "Validating $$pkg/package.json..."; \
		node -e "require('./$$pkg/package.json')"; \
	done
	@node --check npm/ctxlite/bin/ctxlite.js

# Cross-compile (used by CI and local release)
build-one:
	@mkdir -p bin
	GOOS=$(GOOS) GOARCH=$(GOARCH) $(if $(CC),CC=$(CC),) \
		go build $(LDFLAGS) -o $(OUT) ./go/cmd/ctxlite

build-all:
	@mkdir -p bin
	-$(MAKE) build-one GOOS=darwin GOARCH=arm64 OUT=bin/$(BINARY)-darwin-arm64
	-$(MAKE) build-one GOOS=darwin GOARCH=amd64 OUT=bin/$(BINARY)-darwin-x64
	-$(MAKE) build-one GOOS=linux  GOARCH=amd64 OUT=bin/$(BINARY)-linux-x64
	-$(MAKE) build-one GOOS=linux  GOARCH=arm64 CC=aarch64-linux-gnu-gcc OUT=bin/$(BINARY)-linux-arm64
	-$(MAKE) build-one GOOS=windows GOARCH=amd64 OUT=bin/$(BINARY)-win32-x64.exe

release-build:
	@echo "Building release binaries for VERSION=$(VERSION)"
	@$(MAKE) build-all
	@if [ -z "$$(find bin -maxdepth 1 -name '$(BINARY)-*' -print -quit)" ]; then \
		echo "Error: no release binaries were built"; \
		exit 1; \
	fi
	@ls -lh bin/$(BINARY)-* 2>/dev/null || true
	@for bin in bin/$(BINARY)-*; do \
		if [ -f "$$bin" ]; then \
			echo "Smoke test $$bin"; \
			"$$bin" --version || exit 1; \
		fi; \
	done

npm-stage: npm-version
	cp README.md npm/ctxlite/README.md
	@set -e; \
	copy_bin() { \
	  src="$$1"; dst="$$2"; \
	  if [ ! -f "$$src" ]; then \
	    echo "Warning: skipping $$dst — $$src not built (cross-compiler may be required)"; \
	    return 0; \
	  fi; \
	  cp "$$src" "$$dst"; \
	  chmod +x "$$dst" 2>/dev/null || true; \
	  echo "Staged $$dst"; \
	}; \
	copy_bin bin/$(BINARY)-darwin-arm64  npm/ctxlite-darwin-arm64/bin/ctxlite; \
	copy_bin bin/$(BINARY)-darwin-x64    npm/ctxlite-darwin-x64/bin/ctxlite; \
	copy_bin bin/$(BINARY)-linux-x64     npm/ctxlite-linux-x64/bin/ctxlite; \
	copy_bin bin/$(BINARY)-linux-arm64   npm/ctxlite-linux-arm64/bin/ctxlite; \
	copy_bin bin/$(BINARY)-win32-x64.exe npm/ctxlite-win32-x64/bin/ctxlite.exe

npm-publish:
	@set -e; \
	for pkg in npm/ctxlite-darwin-arm64 npm/ctxlite-darwin-x64 npm/ctxlite-linux-x64 \
		npm/ctxlite-linux-arm64 npm/ctxlite-win32-x64; do \
		echo "Publishing $$pkg..."; \
		cd "$$pkg" && npm publish --access public && cd - >/dev/null; \
		sleep 2; \
	done; \
	cd npm/ctxlite && npm publish --access public

npm-version:
	node -e " \
	  const fs = require('fs'); \
	  const version = '$(VERSION)'; \
	  const pkgs = [ \
	    'npm/ctxlite', \
	    'npm/ctxlite-darwin-arm64', \
	    'npm/ctxlite-darwin-x64', \
	    'npm/ctxlite-linux-x64', \
	    'npm/ctxlite-linux-arm64', \
	    'npm/ctxlite-win32-x64', \
	  ]; \
	  pkgs.forEach(p => { \
	    const f = p + '/package.json'; \
	    const j = JSON.parse(fs.readFileSync(f)); \
	    j.version = version; \
	    if (j.optionalDependencies) { \
	      Object.keys(j.optionalDependencies).forEach(k => j.optionalDependencies[k] = version); \
	    } \
	    fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n'); \
	    console.log('Updated', f); \
	  }); \
	"

npm-install-local: release-build npm-stage
	@true

npm-pack:
	cd npm/ctxlite && npm pack --dry-run
	cd npm/ctxlite-darwin-arm64 && npm pack --dry-run
