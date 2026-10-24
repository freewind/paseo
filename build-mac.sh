#!/usr/bin/env bash
# Build the macOS desktop app (Intel x64, unsigned/unnotarized) and reveal the artifacts.
set -euo pipefail

cd "$(dirname "$0")"

RELEASE_DIR="packages/desktop/release"
TMP="${TMPDIR:-/tmp}"

# 每次构建都从干净目录开始：复用上一次的产物时，源码里已删掉的旧文件会被一起打进包。
echo "==> Clearing $RELEASE_DIR"
rm -rf "$RELEASE_DIR"

echo "==> Clearing stale Metro caches"
rm -rf "${TMP%/}/metro-cache" "${TMP%/}"/metro-file-map-*

echo "==> Building macOS x64"
# Unsigned and unnotarized: no certificate discovery, no notarization pass.
export CSC_IDENTITY_AUTO_DISCOVERY=false
# --publish never: electron-builder otherwise tries to upload to GitHub Releases and
# fails the whole build when GH_TOKEN is unset.
# 打包阶段的默认堆不够用，会 OOM；8GB 是本机验证过的上限。
NODE_OPTIONS="--max-old-space-size=8192" npm run build:desktop -- \
  --mac \
  --x64 \
  --config.mac.notarize=false \
  --publish never

echo "==> Opening $RELEASE_DIR"
open "$RELEASE_DIR"
