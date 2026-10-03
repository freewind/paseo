#!/usr/bin/env bash
# Build the macOS desktop app (Intel x64, unsigned/unnotarized) and reveal the artifacts.
set -euo pipefail

cd "$(dirname "$0")"

RELEASE_DIR="packages/desktop/release"
TMP="${TMPDIR:-/tmp}"

echo "==> Clearing $RELEASE_DIR"
rm -rf "$RELEASE_DIR"

echo "==> Clearing stale Metro caches"
rm -rf "${TMP%/}/metro-cache" "${TMP%/}"/metro-file-map-*

echo "==> Building macOS x64"
NODE_OPTIONS="--max-old-space-size=8192" npm run build:desktop:mac:intel

echo "==> Opening $RELEASE_DIR"
open "$RELEASE_DIR"
