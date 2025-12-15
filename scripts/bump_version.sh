#!/bin/bash
# Unified version bumping and tagging script for Redmine Yjs plugin
# Usage:
#   ./scripts/bump_version.sh patch         # 1.0.0 -> 1.0.1
#   ./scripts/bump_version.sh minor         # 1.0.0 -> 1.1.0
#   ./scripts/bump_version.sh major         # 1.0.0 -> 2.0.0
#   ./scripts/bump_version.sh rc            # 1.0.0 -> 1.0.1-rc.0 or 1.0.0-rc.0 -> 1.0.0-rc.1
#   ./scripts/bump_version.sh release       # 1.0.0-rc.0 -> 1.0.0
#   ./scripts/bump_version.sh patch --dry-run  # Preview changes without applying

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PLUGIN_ROOT"

BUMP_TYPE=${1:-patch}
DRY_RUN=false
if [[ "${@}" =~ --dry-run ]]; then
    DRY_RUN=true
fi

INIT_RB="init.rb"
PACKAGE_JSON="package.json"
CHANGELOG="CHANGELOG.md"
PACKAGE_LOCK="package-lock.json"
HOCUSPOCUS_PACKAGE_JSON="hocuspocus/package.json"
HOCUSPOCUS_PACKAGE_LOCK="hocuspocus/package-lock.json"
E2E_PACKAGE_JSON="test/e2e/package.json"
E2E_PACKAGE_LOCK="test/e2e/package-lock.json"

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

# Get current version from init.rb
CURRENT_VERSION=$(grep -E "^\s*version\s+['\"]" "$INIT_RB" | sed -E "s/^.*version[[:space:]]+['\"]([^'\"]+)['\"].*/\1/" | head -1)

if [ -z "$CURRENT_VERSION" ]; then
  log_error "Could not find version in $INIT_RB"
  exit 1
fi

echo "Current version: $CURRENT_VERSION"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    log_error "Not in a git repository"
    exit 1
fi

# Check for uncommitted changes BEFORE making any changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    log_error "You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Parse version components
if [[ $CURRENT_VERSION =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(-rc\.([0-9]+))?$ ]]; then
  MAJOR="${BASH_REMATCH[1]}"
  MINOR="${BASH_REMATCH[2]}"
  PATCH="${BASH_REMATCH[3]}"
  RC_NUM="${BASH_REMATCH[5]}"
else
  log_error "Could not parse version $CURRENT_VERSION"
  exit 1
fi

# Calculate new version
case $BUMP_TYPE in
  major)
    NEW_VERSION="$((MAJOR + 1)).0.0"
    ;;
  minor)
    NEW_VERSION="$MAJOR.$((MINOR + 1)).0"
    ;;
  patch)
    NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
    ;;
  rc)
    if [ -z "$RC_NUM" ]; then
      # No RC yet, create RC.0 for next patch version
      NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))-rc.0"
    else
      # Bump RC number
      NEW_VERSION="$MAJOR.$MINOR.$PATCH-rc.$((RC_NUM + 1))"
    fi
    ;;
  release)
    if [ -z "$RC_NUM" ]; then
      log_error "Not a release candidate version"
      exit 1
    fi
    # Remove RC suffix
    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
    ;;
  *)
    log_error "Unknown bump type: $BUMP_TYPE"
    echo "Usage: $0 {major|minor|patch|rc|release} [--dry-run]"
    exit 1
    ;;
esac

echo "New version: $NEW_VERSION"

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "=== DRY RUN MODE ==="
    echo "No changes will be made."
    echo ""
fi

# Update init.rb
log_info "Updating $INIT_RB..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/version ['\"]$CURRENT_VERSION['\"]/version '$NEW_VERSION'/" "$INIT_RB"
else
  sed -i "s/version ['\"]$CURRENT_VERSION['\"]/version '$NEW_VERSION'/" "$INIT_RB"
fi
log_success "Updated $INIT_RB"

# Update package.json
if [ -f "$PACKAGE_JSON" ]; then
  log_info "Updating $PACKAGE_JSON..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"
  else
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"
  fi
  log_success "Updated $PACKAGE_JSON"
fi

# Update hocuspocus/package.json if it exists
if [ -f "$HOCUSPOCUS_PACKAGE_JSON" ]; then
  log_info "Updating $HOCUSPOCUS_PACKAGE_JSON..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$HOCUSPOCUS_PACKAGE_JSON"
  else
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$HOCUSPOCUS_PACKAGE_JSON"
  fi
  log_success "Updated $HOCUSPOCUS_PACKAGE_JSON"
fi

# Update test/e2e/package.json if it exists
if [ -f "$E2E_PACKAGE_JSON" ]; then
  log_info "Updating $E2E_PACKAGE_JSON..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$E2E_PACKAGE_JSON"
  else
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$E2E_PACKAGE_JSON"
  fi
  log_success "Updated $E2E_PACKAGE_JSON"
fi

# Update CHANGELOG.md if it exists
if [ -f "$CHANGELOG" ]; then
  TODAY=$(date +%Y-%m-%d)
  if grep -q "^## \[Unreleased\]" "$CHANGELOG"; then
    log_info "Updating $CHANGELOG..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "/^## \[Unreleased\]/a\\
\\
## [$NEW_VERSION] - $TODAY
" "$CHANGELOG"
    else
      sed -i "/^## \[Unreleased\]/a\\
\\
## [$NEW_VERSION] - $TODAY
" "$CHANGELOG"
    fi
    log_success "Updated $CHANGELOG"
  else
    log_info "No [Unreleased] section found in $CHANGELOG, skipping"
  fi
fi

# Update lock files
log_info "Updating lock files..."

if [ -f "$PACKAGE_JSON" ] && [ -f "$PACKAGE_LOCK" ]; then
  if [ "$DRY_RUN" = false ]; then
    if command -v npm &> /dev/null; then
      log_info "Updating $PACKAGE_LOCK..."
      npm install --package-lock-only 2>/dev/null || log_info "Could not update $PACKAGE_LOCK (this is OK)"
    fi
  else
    log_info "[DRY RUN] Would update $PACKAGE_LOCK"
  fi
fi

if [ -f "$HOCUSPOCUS_PACKAGE_JSON" ] && [ -f "$HOCUSPOCUS_PACKAGE_LOCK" ]; then
  if [ "$DRY_RUN" = false ]; then
    if command -v npm &> /dev/null; then
      log_info "Updating $HOCUSPOCUS_PACKAGE_LOCK..."
      (cd hocuspocus && npm install --package-lock-only 2>/dev/null) || log_info "Could not update $HOCUSPOCUS_PACKAGE_LOCK (this is OK)"
    fi
  else
    log_info "[DRY RUN] Would update $HOCUSPOCUS_PACKAGE_LOCK"
  fi
fi

if [ -f "$E2E_PACKAGE_JSON" ] && [ -f "$E2E_PACKAGE_LOCK" ]; then
  if [ "$DRY_RUN" = false ]; then
    if command -v npm &> /dev/null; then
      log_info "Updating $E2E_PACKAGE_LOCK..."
      (cd test/e2e && npm install --package-lock-only 2>/dev/null) || log_info "Could not update $E2E_PACKAGE_LOCK (this is OK)"
    fi
  else
    log_info "[DRY RUN] Would update $E2E_PACKAGE_LOCK"
  fi
fi

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "=== DRY RUN COMPLETE ==="
    echo "Run without --dry-run to apply changes, commit, and tag."
    exit 0
fi

# Rebuild JavaScript assets before committing
log_info "Rebuilding JavaScript assets..."
BUILD_SCRIPT="${SCRIPT_DIR}/build-js.sh"
if [ -f "$BUILD_SCRIPT" ]; then
    if bash "$BUILD_SCRIPT"; then
        log_success "JavaScript assets rebuilt"
    else
        log_error "Failed to rebuild JavaScript assets"
        exit 1
    fi
else
    log_error "Build script not found: $BUILD_SCRIPT"
    exit 1
fi

# Stage all changes
log_info "Staging changes..."
git add "$INIT_RB"
[ -f "$PACKAGE_JSON" ] && git add "$PACKAGE_JSON"
[ -f "$PACKAGE_LOCK" ] && git add "$PACKAGE_LOCK"
[ -f "$HOCUSPOCUS_PACKAGE_JSON" ] && git add "$HOCUSPOCUS_PACKAGE_JSON"
[ -f "$HOCUSPOCUS_PACKAGE_LOCK" ] && git add "$HOCUSPOCUS_PACKAGE_LOCK"
[ -f "$E2E_PACKAGE_JSON" ] && git add "$E2E_PACKAGE_JSON"
[ -f "$E2E_PACKAGE_LOCK" ] && git add "$E2E_PACKAGE_LOCK"
[ -f "$CHANGELOG" ] && git add "$CHANGELOG"
# Stage built JavaScript assets
[ -f "assets/javascripts/yjs-deps.bundle.js" ] && git add "assets/javascripts/yjs-deps.bundle.js"
[ -f "assets/javascripts/yjs-collaboration.js" ] && git add "assets/javascripts/yjs-collaboration.js"

# Commit
COMMIT_MESSAGE="Bump version to $NEW_VERSION"
log_info "Committing changes..."
git commit -m "$COMMIT_MESSAGE"
log_success "Committed: $COMMIT_MESSAGE"

# Create tag
TAG="v$NEW_VERSION"
log_info "Creating git tag: $TAG"
if git rev-parse "$TAG" >/dev/null 2>&1; then
    log_error "Tag $TAG already exists"
    exit 1
fi
git tag -a "$TAG" -m "Version $NEW_VERSION"
log_success "Created tag: $TAG"

echo ""
log_success "Version bumped from $CURRENT_VERSION to $NEW_VERSION"
echo ""
echo "Files updated:"
echo "  - $INIT_RB"
[ -f "$PACKAGE_JSON" ] && echo "  - $PACKAGE_JSON"
[ -f "$PACKAGE_LOCK" ] && echo "  - $PACKAGE_LOCK"
[ -f "$HOCUSPOCUS_PACKAGE_JSON" ] && echo "  - $HOCUSPOCUS_PACKAGE_JSON"
[ -f "$HOCUSPOCUS_PACKAGE_LOCK" ] && echo "  - $HOCUSPOCUS_PACKAGE_LOCK"
[ -f "$E2E_PACKAGE_JSON" ] && echo "  - $E2E_PACKAGE_JSON"
[ -f "$E2E_PACKAGE_LOCK" ] && echo "  - $E2E_PACKAGE_LOCK"
[ -f "$CHANGELOG" ] && echo "  - $CHANGELOG"
echo ""
echo "✓ Changes committed"
echo "✓ Git tag $TAG created"
echo ""
echo "Next steps:"
echo "  1. Review: git show"
echo "  2. Push: git push && git push --tags"
if [[ $NEW_VERSION =~ -rc\. ]]; then
  echo ""
  echo "📦 This is a pre-release (RC)."
else
  echo ""
  echo "📦 This is a stable release."
fi
