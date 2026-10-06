#!/bin/sh
# Builds the pH app APK in Docker (same build image as HC Bridge) and publishes
# it for download in the web UI (Daten -> Datenquellen).
# Raise versionCode in app/build.gradle.kts for updates.
# Signing: uses ../android/keystore/keystore.properties if present (one key for both apps).
set -e
cd "$(dirname "$0")"
docker image inspect hc-bridge-build >/dev/null 2>&1 || docker build -t hc-bridge-build -f ../android/Dockerfile.build ../android
docker run --rm --memory=3g -v "$PWD/..":/repo -v hc-bridge-gradle:/root/.gradle -w /repo/android-ph hc-bridge-build \
  sh -c "echo sdk.dir=/opt/android-sdk > local.properties && gradle --no-daemon -q assembleRelease"
mkdir -p ../data/app
cp app/build/outputs/apk/release/app-release.apk ../data/app/ph-app.apk
echo "APK bereit: data/app/ph-app.apk"
