#!/usr/bin/env bash
# Publish TypeScript workspace packages to npm (run from repo root).
#
# Do NOT run `npm publish` at the repo root — root package.json has no version field
# and is private, which triggers: "Cannot read properties of null (reading 'prerelease')".
#
# Usage:
#   ./scripts/publish-npm.sh              # dry-run all packages
#   ./scripts/publish-npm.sh --publish    # publish in dependency order

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PUBLISH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish)
      PUBLISH=1
      shift
      ;;
    -h | --help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

PACKAGES=(
  packages/core
  packages/opencode
  packages/mcp
  packages/cli
)

echo "==> build"
npm run build

echo "==> verify versions"
ROOT_VERSION=$(node -e "console.log(require('./package.json').config.version)")
for pkg in "${PACKAGES[@]}"; do
  PKG_VERSION=$(node -e "console.log(require('./${pkg}/package.json').version)")
  if [[ "$ROOT_VERSION" != "$PKG_VERSION" ]]; then
    echo "Version mismatch in ${pkg}: ${PKG_VERSION} != ${ROOT_VERSION}" >&2
    echo "Run: node scripts/sync-version.js" >&2
    exit 1
  fi
done
echo "All packages at v${ROOT_VERSION}"

for pkg in "${PACKAGES[@]}"; do
  NAME=$(node -e "console.log(require('./${pkg}/package.json').name)")
  echo "==> ${NAME}@${ROOT_VERSION}"
  if [[ "$PUBLISH" -eq 1 ]]; then
    (cd "$pkg" && npm publish --access public)
  else
    (cd "$pkg" && npm publish --access public --dry-run)
  fi
done

if [[ "$PUBLISH" -eq 0 ]]; then
  echo
  echo "Dry run complete. To publish: ./scripts/publish-npm.sh --publish"
fi
