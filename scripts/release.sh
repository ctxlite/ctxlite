#!/usr/bin/env bash
# Local release pipeline — use when GitHub Actions minutes are unavailable.
#
# Examples:
#   ./scripts/release.sh 0.1.0 --dry-run
#   ./scripts/release.sh 0.1.0 --publish
#   ./scripts/release.sh 0.1.0 --publish --github
#
# Requirements:
#   - Go 1.22+ with CGO enabled
#   - Node.js 18+ for npm publish
#   - Optional: aarch64-linux-gnu-gcc for linux-arm64 cross-build on Linux/macOS
#   - Optional: NPM_TOKEN env var for npm publish
#   - Optional: gh CLI for GitHub releases

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION=""
DRY_RUN=0
PUBLISH=0
GITHUB_RELEASE=0

usage() {
  cat <<EOF
Usage: $(basename "$0") <version> [options]

Options:
  --dry-run     Build and stage npm packages only (default if no publish flags)
  --publish     Publish all npm packages (requires NPM_TOKEN or npm login)
  --github      Create a GitHub release with binaries (requires gh CLI)
  -h, --help    Show this help

Examples:
  $(basename "$0") 0.1.0 --dry-run
  $(basename "$0") 0.1.0 --publish --github
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --publish)
      PUBLISH=1
      shift
      ;;
    --github)
      GITHUB_RELEASE=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$VERSION" ]]; then
        VERSION="${1#v}"
      else
        echo "Unknown argument: $1" >&2
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "Error: version is required" >&2
  usage
  exit 1
fi

if [[ "$PUBLISH" -eq 0 && "$GITHUB_RELEASE" -eq 0 ]]; then
  DRY_RUN=1
fi

echo "==> ctxlite release v${VERSION}"

echo "==> Building platform binaries"
make release-build VERSION="$VERSION"

echo "==> Staging npm packages"
make npm-stage VERSION="$VERSION"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> Dry run complete"
  make npm-pack
  echo
  echo "Binaries staged under npm/ctxlite-*/bin/ and bin/"
  echo "Run with --publish and/or --github to continue."
  exit 0
fi

if [[ "$PUBLISH" -eq 1 ]]; then
  echo "==> Publishing npm packages"
  make npm-publish
fi

if [[ "$GITHUB_RELEASE" -eq 1 ]]; then
  echo "==> Creating GitHub release"
  if ! command -v gh >/dev/null 2>&1; then
    echo "Error: gh CLI not found. Install from https://cli.github.com/" >&2
    exit 1
  fi

  TAG="v${VERSION}"
  if ! git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "Creating git tag ${TAG}"
    git tag "$TAG"
    echo "Push the tag when ready: git push origin ${TAG}"
  fi

  gh release create "$TAG" \
    bin/ctxlite-darwin-arm64 \
    bin/ctxlite-darwin-x64 \
    bin/ctxlite-linux-x64 \
    bin/ctxlite-linux-arm64 \
    bin/ctxlite-win32-x64.exe \
    --title "ctxlite ${TAG}" \
    --generate-notes \
    --notes "## Install

\`\`\`bash
npm install -g ctxlite
\`\`\`

Or download the binary for your platform below."
fi

echo "==> Release v${VERSION} complete"
