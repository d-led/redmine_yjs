#!/bin/bash
# Build JavaScript assets for redmine_yjs plugin
# This script builds the Yjs dependencies bundle

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PLUGIN_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_info "Building JavaScript assets..."

# Check Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
log_info "Node.js: $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    log_error "npm is not installed"
    exit 1
fi

NPM_VERSION=$(npm --version)
log_info "npm: $NPM_VERSION"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    log_info "Installing Node.js dependencies..."
    if npm install; then
        log_success "Dependencies installed"
    else
        log_error "Failed to install dependencies"
        exit 1
    fi
else
    log_info "Dependencies already installed"
fi

# Build assets
log_info "Building Yjs dependencies bundle..."
if npm run build:deps; then
    log_success "Assets built successfully"
    
    # Check if bundle was created
    BUNDLE_FILE="$PLUGIN_DIR/assets/javascripts/yjs-deps.bundle.js"
    if [ -f "$BUNDLE_FILE" ]; then
        SIZE=$(du -h "$BUNDLE_FILE" | cut -f1)
        log_success "Bundle created: $BUNDLE_FILE ($SIZE)"
    else
        log_error "Bundle file not found at expected location: $BUNDLE_FILE"
        exit 1
    fi
else
    log_error "Failed to build assets"
    exit 1
fi

log_success "Build complete!"

