#!/bin/bash

# Lattice macOS Fix Script
# This script helps resolve Gatekeeper issues for unsigned macOS builds.

APP_PATH="/Applications/Lattice.app"

if [ ! -d "$APP_PATH" ]; then
    echo "❌ Lattice.app not found in /Applications."
    echo "Please move Lattice.app to your Applications folder first."
    exit 1
fi

echo "🚀 Fixing Lattice.app Gatekeeper issues..."

# Remove quarantine attribute
echo "  -> Removing quarantine flag..."
sudo xattr -rd com.apple.quarantine "$APP_PATH"

# Ad-hoc sign the app
echo "  -> Ad-hoc signing the application..."
sudo codesign --force --deep --sign - "$APP_PATH"

echo "✅ Done! You should now be able to open Lattice from your Applications folder."
echo "If you still have issues, try Right-Click -> Open."
