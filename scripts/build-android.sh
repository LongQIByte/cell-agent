#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_variant=release
build_task=assembleRelease
build_name=codex-remote
build_architectures=arm64-v8a,armeabi-v7a
export APP_VARIANT=production
export NODE_ENV=production
if [[ "${1:-}" == '--dev' && "$#" == 1 ]]; then
  build_variant=debug
  build_task=assembleDebug
  build_name=codex-remote-dev
  build_architectures=arm64-v8a
  export APP_VARIANT=development
  export NODE_ENV=development
elif [[ "$#" != 0 ]]; then
  echo 'Usage: bash scripts/build-android.sh [--dev]' >&2
  exit 1
fi
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
cd "$project_root/apps/mobile"
npx expo prebuild --platform android --no-install
# React Native keys this generated cache by package/lockfiles, while Expo
# prebuild changes the Android application ID when switching build variants.
rm -f android/build/generated/autolinking/autolinking.json
printf 'sdk.dir=%s\n' "$build_sdk_dir" > android/local.properties
if [[ -n "${CODEX_REMOTE_CMAKE_DIR:-}" ]]; then
  printf 'cmake.dir=%s\n' "$CODEX_REMOTE_CMAKE_DIR" >> android/local.properties
fi
build_args=(--no-daemon --max-workers=2 "-PreactNativeArchitectures=$build_architectures"
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
./gradlew ":app:$build_task" "${build_args[@]}"
mkdir -p "$project_root/artifacts"
cp "app/build/outputs/apk/$build_variant/app-$build_variant.apk" "$project_root/artifacts/$build_name.apk"
cd "$project_root"
node --input-type=module -e '
  import { createHash } from "node:crypto";
  import { readFileSync, writeFileSync } from "node:fs";
  const file = process.argv[1];
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  writeFileSync(`${file}.sha256`, `${hash}  ${file}\n`);
' "artifacts/$build_name.apk"
if [[ "$build_variant" == debug ]]; then
  echo "Built $project_root/artifacts/$build_name.apk (ARM64 development client; connect with npm run dev)."
else
  echo "Built $project_root/artifacts/$build_name.apk (standalone LAN testing APK, debug signing)."
fi
