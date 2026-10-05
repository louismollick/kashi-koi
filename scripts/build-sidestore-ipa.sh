#!/usr/bin/env bash
# Builds an unsigned IPA for SideStore, plus the SideStore source entry describing it.
# Called by .github/workflows/sidestore.yml. Writes build/sidestore/<asset>.ipa and build/sidestore/app.json.
#
# Env: CHANNEL (main|pr), RELEASE_TAG, COMMIT_SHA, GITHUB_REPOSITORY, GITHUB_RUN_NUMBER,
#      and for PRs: PR_NUMBER, PR_TITLE, PR_URL.
set -euo pipefail
: "${CHANNEL:?}" "${RELEASE_TAG:?}" "${COMMIT_SHA:?}" "${GITHUB_REPOSITORY:?}" "${GITHUB_RUN_NUMBER:?}"

BASE_BUNDLE_ID=$(jq -r .expo.ios.bundleIdentifier app.json)
BASE_NAME=$(jq -r .expo.name app.json)
BASE_VERSION=$(jq -r .expo.version app.json)
BUILD_NUMBER=$GITHUB_RUN_NUMBER

# SideStore detects updates by version, so every run gets a higher one.
if [ "$CHANNEL" = main ]; then
  BUNDLE_ID=$BASE_BUNDLE_ID
  NAME=$BASE_NAME
  VERSION="$(cut -d. -f1-2 <<<"$BASE_VERSION").$BUILD_NUMBER"
  SUBTITLE="Latest main build"
  DESCRIPTION="Latest build of the main branch."
else
  : "${PR_NUMBER:?}" "${PR_TITLE:?}" "${PR_URL:?}"
  BUNDLE_ID="$BASE_BUNDLE_ID.pr$PR_NUMBER"
  NAME="$BASE_NAME PR $PR_NUMBER"
  VERSION="0.$PR_NUMBER.$BUILD_NUMBER"
  SUBTITLE=$PR_TITLE
  DESCRIPTION="Preview of PR #$PR_NUMBER: $PR_TITLE"$'\n'"$PR_URL"
fi

npx expo prebuild --platform ios
xcodebuild -quiet -workspace ios/KashiKoi.xcworkspace -scheme KashiKoi \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath build/derived CODE_SIGNING_ALLOWED=NO COMPILER_INDEX_STORE_ENABLE=NO

APP=build/derived/Build/Products/Release-iphoneos/KashiKoi.app
test -f "$APP/main.jsbundle"

# Unsigned, so the channel identity can be patched after building. SideStore signs on install.
plutil -replace CFBundleIdentifier -string "$BUNDLE_ID" "$APP/Info.plist"
plutil -replace CFBundleDisplayName -string "$NAME" "$APP/Info.plist"
plutil -replace CFBundleShortVersionString -string "$VERSION" "$APP/Info.plist"
plutil -replace CFBundleVersion -string "$BUILD_NUMBER" "$APP/Info.plist"

OUT=build/sidestore
ASSET="KashiKoi-$CHANNEL${PR_NUMBER:-}-$VERSION.ipa"
rm -rf "$OUT" build/Payload
mkdir -p "$OUT" build/Payload
cp -R "$APP" build/Payload/
(cd build && zip -qry "sidestore/$ASSET" Payload)

# One entry of the source's `apps` array (AltStore/SideStore source format).
plutil -convert json -o - "$APP/Info.plist" | jq \
  --arg name "$NAME" --arg bundle "$BUNDLE_ID" --arg subtitle "$SUBTITLE" --arg description "$DESCRIPTION" \
  --arg version "$VERSION" --arg build "$BUILD_NUMBER" --arg sha "${COMMIT_SHA:0:7}" \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson size "$(stat -f %z "$OUT/$ASSET")" \
  --arg url "https://github.com/$GITHUB_REPOSITORY/releases/download/$RELEASE_TAG/$ASSET" \
  --arg icon "https://raw.githubusercontent.com/$GITHUB_REPOSITORY/main/assets/sidestore-icon.png" \
  '{
    name: $name, bundleIdentifier: $bundle, developerName: "louismollick",
    subtitle: $subtitle, localizedDescription: $description, iconURL: $icon, tintColor: "#000000",
    versions: [{
      version: $version, buildVersion: $build, date: $date, localizedDescription: "Build \($sha)",
      downloadURL: $url, size: $size, minOSVersion: .MinimumOSVersion
    }],
    appPermissions: {entitlements: [], privacy: with_entries(select(.key | test("^NS.*UsageDescription$")))}
  }' > "$OUT/app.json"
