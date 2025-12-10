#!/bin/bash
# Inject build timestamp into yjs-collaboration.js

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
JS_FILE="$PLUGIN_DIR/assets/javascripts/yjs-collaboration.js"

if [ ! -f "$JS_FILE" ]; then
  echo "Error: $JS_FILE not found"
  exit 1
fi

# Generate ISO 8601 timestamp
BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Update build timestamp in the file (both comment and const)
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/Build: BUILD_TIMESTAMP_PLACEHOLDER/Build: $BUILD_TIMESTAMP/" "$JS_FILE"
  sed -i '' "s/BUILD_TIMESTAMP_PLACEHOLDER/$BUILD_TIMESTAMP/g" "$JS_FILE"
else
  # Linux
  sed -i "s/Build: BUILD_TIMESTAMP_PLACEHOLDER/Build: $BUILD_TIMESTAMP/" "$JS_FILE"
  sed -i "s/BUILD_TIMESTAMP_PLACEHOLDER/$BUILD_TIMESTAMP/g" "$JS_FILE"
fi

echo "[build] Injected build timestamp: $BUILD_TIMESTAMP into $JS_FILE"

