#!/usr/bin/env bash
# Build the Android release APK (production variant) and reveal the output directory.
set -euo pipefail

cd "$(dirname "$0")"

ANDROID_DIR="packages/app/android"
APK_DIR="$ANDROID_DIR/app/build/outputs/apk/release"
TMP="${TMPDIR:-/tmp}"

echo "==> Clearing $ANDROID_DIR"
rm -rf "$ANDROID_DIR"

echo "==> Clearing stale Metro caches"
rm -rf "${TMP%/}/metro-cache" "${TMP%/}"/metro-file-map-*

echo "==> Building client packages"
npm run build:client

echo "==> Prebuilding Android project (production)"
cd packages/app
APP_VARIANT=production npx expo prebuild --platform android --clean --non-interactive

echo "==> Running gradle assembleRelease"
cd android
./gradlew assembleRelease
cd ../..

echo "==> Opening $APK_DIR"
open "$APK_DIR"
