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
# Unsigned and unnotarized: no certificate discovery, no notarization pass.
export CSC_IDENTITY_AUTO_DISCOVERY=false
# --publish never: electron-builder otherwise tries to upload to GitHub Releases and
# fails the whole build when GH_TOKEN is unset.
NODE_OPTIONS="--max-old-space-size=8192" npm run build:desktop -- \
  --mac \
  --x64 \
  --config.mac.notarize=false \
  --publish never

echo "==> Opening $RELEASE_DIR"
open "$RELEASE_DIR"
