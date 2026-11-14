#!/usr/bin/env bash
# 本地开发：连接 6767 的现有 daemon 启动 Expo dev app
# npm run dev:app 被 cross-env 写死为 6768，外部变量传不进去，所以直接跑脚本
# EXPO_PUBLIC_* 是 Metro 打包时内联的，缓存命中会残留旧值（比如旧后端地址）。
# Metro 的 transform 缓存在 $TMPDIR/metro-cache 与 $TMPDIR/metro-file-map-expo-*，
# 只清这两处；TMPDIR 未设置时跳过清理，避免误删系统临时目录里的无关内容。
if [ -n "${TMPDIR:-}" ]; then
  rm -rf "$TMPDIR/metro-cache" "$TMPDIR"/metro-file-map-expo-*
fi
PASEO_LISTEN=127.0.0.1:6767 ./scripts/dev-app.sh
