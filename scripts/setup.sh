#!/bin/bash
# Setup script for redmine_yjs plugin
# Ensures all dependencies are installed and assets are built

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PLUGIN_DIR"

echo "=========================================="
echo "Redmine Yjs Plugin Setup"
echo "=========================================="
echo ""

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

# Check Node.js
log_info "Checking Node.js..."
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Please install Node.js 18+ to build assets."
    log_info "Assets are pre-built in the repository, so this is optional for end users."
    log_info "For development, install Node.js from https://nodejs.org/"
    NODE_AVAILABLE=false
else
    NODE_VERSION=$(node --version)
    log_success "Node.js found: $NODE_VERSION"
    NODE_AVAILABLE=true
fi

# Check npm
if [ "$NODE_AVAILABLE" = true ]; then
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        NODE_AVAILABLE=false
    else
        NPM_VERSION=$(npm --version)
        log_success "npm found: $NPM_VERSION"
    fi
fi

# Build assets if Node.js is available
if [ "$NODE_AVAILABLE" = true ]; then
    log_info "Installing Node.js dependencies..."
    if npm install; then
        log_success "Node.js dependencies installed"
    else
        log_error "Failed to install Node.js dependencies"
        exit 1
    fi
    
    log_info "Building Yjs dependencies bundle..."
    if npm run build:deps; then
        log_success "Assets built successfully"
        
        # Check if bundle was created
        BUNDLE_FILE="$PLUGIN_DIR/assets/javascripts/yjs-deps.bundle.js"
        if [ -f "$BUNDLE_FILE" ]; then
            SIZE=$(du -h "$BUNDLE_FILE" | cut -f1)
            log_success "Bundle created: $BUNDLE_FILE ($SIZE)"
        fi
    else
        log_error "Failed to build assets"
        exit 1
    fi
else
    log_info "Skipping asset build (Node.js not available)"
    log_info "Pre-built assets should be available in assets/ directory"
fi

# Check Ruby/Rails (for Rake tasks)
log_info "Checking Ruby/Rails environment..."
if command -v bundle &> /dev/null && [ -f "$PLUGIN_DIR/../Gemfile" ] || [ -f "$PLUGIN_DIR/../../Gemfile" ]; then
    log_success "Ruby/Rails environment detected"
    log_info "You can run Rake tasks from Redmine root:"
    log_info "  bundle exec rake redmine_yjs:build_assets"
    log_info "  bundle exec rake redmine_yjs:copy_assets"
    log_info "  bundle exec rake redmine_yjs:setup"
else
    log_info "Ruby/Rails environment not detected (this is OK for asset-only setup)"
fi

echo ""
log_success "Setup complete!"
echo ""
log_info "Next steps:"
echo "  1. Copy this plugin to your Redmine plugins directory"
echo "  2. Run migrations: bundle exec rake redmine:plugins:migrate"
echo "  3. Restart Redmine"
echo ""
log_info "Assets will be automatically copied on plugin load."

