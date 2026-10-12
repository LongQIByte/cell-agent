#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tool_cache="${CODEX_REMOTE_TOOL_CACHE:-$HOME/.cache/codex-remote-tools}"
build_sdk_dir="${ANDROID_HOME:-$tool_cache/android-sdk}"
build_java_dir="${JAVA_HOME:-$tool_cache/jdk17}"
if [[ ! -d "$build_sdk_dir/platforms/android-36" ]]; then
  echo 'Install Android SDK platform 36 and build-tools 36.0.0, then set ANDROID_HOME.' >&2
  exit 1
fi
if [[ ! -x "$build_java_dir/bin/java" ]]; then
  echo 'Install JDK 17 or newer and set JAVA_HOME.' >&2
  exit 1
fi
export ANDROID_HOME="$build_sdk_dir"
export JAVA_HOME="$build_java_dir"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$tool_cache/gradle}"
export NODE_ENV=production
cd "$project_root/apps/mobile"
npx expo prebuild --platform android --no-install
printf 'sdk.dir=%s\n' "$build_sdk_dir" > android/local.properties
if [[ -n "${CODEX_REMOTE_CMAKE_DIR:-}" ]]; then
  printf 'cmake.dir=%s\n' "$CODEX_REMOTE_CMAKE_DIR" >> android/local.properties
fi
build_args=(--no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
  -Dorg.gradle.jvmargs=-Xmx2048m -Dorg.gradle.internal.http.connectionTimeout=30000
  -Dorg.gradle.internal.http.socketTimeout=180000)
if [[ "${CODEX_REMOTE_BUILD_INFO:-}" == '1' ]]; then
  build_args+=(--info --console=plain)
fi
if [[ -n "${CODEX_REMOTE_PROXY_PORT:-}" ]]; then
  build_proxy_host="${CODEX_REMOTE_PROXY_HOST:-127.0.0.1}"
  build_args+=("-Dhttp.proxyHost=$build_proxy_host" "-Dhttp.proxyPort=$CODEX_REMOTE_PROXY_PORT"
    "-Dhttps.proxyHost=$build_proxy_host" "-Dhttps.proxyPort=$CODEX_REMOTE_PROXY_PORT"
    '-Dhttp.nonProxyHosts=localhost|127.*' '-Dhttps.nonProxyHosts=localhost|127.*')
fi
if [[ -n "${CODEX_REMOTE_GRADLE_INIT:-}" ]]; then
  build_args+=(--init-script "$CODEX_REMOTE_GRADLE_INIT")
fi
cd android
./gradlew :app:assembleRelease "${build_args[@]}"
mkdir -p "$project_root/artifacts"
cp app/build/outputs/apk/release/app-release.apk "$project_root/artifacts/codex-remote.apk"
cd "$project_root"
sha256sum artifacts/codex-remote.apk > artifacts/codex-remote.apk.sha256
echo "Built $project_root/artifacts/codex-remote.apk (standalone LAN testing APK, debug signing)."
