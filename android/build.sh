#!/bin/sh
# Builds the HC Bridge APK in Docker and publishes it for download in the web UI
# (Daten -> Datenquellen). Raise versionCode in app/build.gradle.kts for updates.
set -e
cd "$(dirname "$0")"
docker image inspect hc-bridge-build >/dev/null 2>&1 || docker build -t hc-bridge-build -f Dockerfile.build .
docker run --rm --memory=3g -v "$PWD":/src -v hc-bridge-gradle:/root/.gradle hc-bridge-build sh -c "echo sdk.dir=/opt/android-sdk > local.properties && gradle --no-daemon -q assembleRelease"
mkdir -p ../data/app
cp app/build/outputs/apk/release/app-release.apk ../data/app/hc-bridge.apk
echo "APK bereit: data/app/hc-bridge.apk"
