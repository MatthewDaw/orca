#!/bin/sh
# Signs the fork app with the stable local identity "Orca Matt Fork Local Signing".
# Why: ad-hoc signatures change every build, so macOS re-asks for keychain and Documents
# access each launch; a fixed certificate keeps "Always Allow" valid across rebuilds.
set -e
APP="${1:-dist/mac-arm64/Orca - Matt Fork.app}"
codesign --force --deep --sign "Orca Matt Fork Local Signing" "$APP"
codesign --verify --deep --strict "$APP"
codesign -d -r- "$APP" 2>&1 | grep designated
