#!/usr/bin/env bash
# Archives the iOS app, signs it and uploads it to TestFlight from this Mac:
# the local, free counterpart of .github/workflows/testflight.yml.
#
# Needs TEAM_ID (10-character Apple Team ID), from the environment or from
# ~/.config/cot/testflight.env. Signing is automatic, using the Apple account
# signed in to Xcode. To upload with an App Store Connect API key instead, set
# ASC_KEY_PATH (the AuthKey_<id>.p8), ASC_KEY_ID and ASC_ISSUER_ID there too.
set -euo pipefail

config="${COT_TESTFLIGHT_ENV:-$HOME/.config/cot/testflight.env}"
# shellcheck source=/dev/null
[ -f "$config" ] && . "$config"
: "${TEAM_ID:?Set TEAM_ID in the environment or in $config}"

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

auth=(-allowProvisioningUpdates)
if [ -n "${ASC_KEY_PATH:-}" ]; then
  auth+=(
    -authenticationKeyPath "$ASC_KEY_PATH"
    -authenticationKeyID "${ASC_KEY_ID:?Set ASC_KEY_ID with ASC_KEY_PATH}"
    -authenticationKeyIssuerID "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID with ASC_KEY_PATH}"
  )
fi

cd "$root/apps/mobile"
xcodegen generate

# The build number must grow with every upload. A UTC timestamp does, and
# matches the TestFlight workflow, so local and CI uploads interleave.
build=$(date -u +%Y%m%d%H%M)
xcodebuild archive \
  -project Cot.xcodeproj \
  -scheme Cot \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$work/App.xcarchive" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CURRENT_PROJECT_VERSION="$build" \
  "${auth[@]}"

cat > "$work/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>$TEAM_ID</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
PLIST

xcodebuild -exportArchive \
  -archivePath "$work/App.xcarchive" \
  -exportOptionsPlist "$work/ExportOptions.plist" \
  -exportPath "$work/export" \
  "${auth[@]}"

echo "Uploaded build $build to TestFlight."
