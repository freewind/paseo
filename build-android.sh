#!/usr/bin/env bash
# Build the Android release APK (production variant) and reveal the output directory.
# 结尾用 open 打开产物目录；open 是 macOS 独有命令，脚本没有平台判断，所以只能在 macOS 上跑完。
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$PWD"

# 删的是整个原生工程目录，不只是本次生成的产物：手改过的原生配置会一起丢失。
ANDROID_DIR="packages/app/android"
APK_DIR="$ROOT/packages/app/android/app/build/outputs/apk/release"
TMP="${TMPDIR:-/tmp}"

# 每次构建都从干净目录开始：复用上一次的产物时，源码里已删掉的旧文件会被一起打进包。
echo "==> Clearing $ANDROID_DIR"
rm -rf "$ANDROID_DIR"

echo "==> Clearing stale Metro caches"
rm -rf "${TMP%/}/metro-cache" "${TMP%/}"/metro-file-map-*

echo "==> Building client packages"
# 必须先产出客户端资源再跑 prebuild，否则包内是旧资源。
npm run build:client

echo "==> Prebuilding Android project (production)"
cd packages/app
APP_VARIANT=production npx expo prebuild --platform android --clean --non-interactive

echo "==> Running gradle assembleRelease"
cd android
./gradlew assembleRelease
cd "$ROOT"

echo "==> Opening $APK_DIR"
open "$APK_DIR"
