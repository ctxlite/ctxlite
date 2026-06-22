#!/usr/bin/env bash
# Run CI checks locally — mirrors .github/workflows/ci.yml
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> npm ci"
npm ci

echo "==> typecheck"
npm run typecheck

echo "==> build"
npm run build

echo "==> test"
npm test

echo "==> lint"
npm run lint

echo "==> validate package.json files"
for pkg in packages/core packages/opencode packages/mcp packages/cli; do
  echo "Checking $pkg/package.json..."
  node -e "require('./$pkg/package.json')"
done

echo "==> check versions in sync"
ROOT_VERSION=$(node -e "console.log(require('./package.json').config.version)")
for pkg in packages/core packages/opencode packages/mcp packages/cli; do
  PKG_VERSION=$(node -e "console.log(require('./$pkg/package.json').version)")
  if [ "$ROOT_VERSION" != "$PKG_VERSION" ]; then
    echo "Version mismatch in $pkg: $PKG_VERSION != $ROOT_VERSION"
    exit 1
  fi
done
echo "All versions in sync: $ROOT_VERSION"

echo "==> check no console.log in MCP server"
if grep -rEn '^\s*console\.log\s*\(' packages/mcp/src/ --include='*.ts'; then
  echo "ERROR: console.log found in MCP server — use console.error instead"
  exit 1
fi
echo "OK: no console.log in MCP server"

echo "==> Local CI passed"
