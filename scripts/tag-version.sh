#!/usr/bin/env bash
set -euo pipefail

# Script to bump and tag semantic versions for redmine_yjs plugin
# Usage: ./scripts/tag-version.sh [major|minor|patch|rc|release] [--dry-run] [--push]
#
# Files updated:
#   - init.rb (Redmine plugin version)
#   - package.json (npm version)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INIT_RB="${PLUGIN_ROOT}/init.rb"
PACKAGE_JSON="${PLUGIN_ROOT}/package.json"

# Check for dry-run flag
DRY_RUN=false
if [[ "${@}" =~ --dry-run ]]; then
    DRY_RUN=true
fi

# Check for push flag (defaults to false)
PUSH=false
if [[ "${@}" =~ --push ]]; then
    PUSH=true
fi

# Check for yes/auto-confirm flag (defaults to false)
YES=false
if [[ "${@}" =~ -y ]] || [[ "${@}" =~ --yes ]]; then
    YES=true
fi

# Get current version from init.rb
get_current_version() {
    if [ -f "${INIT_RB}" ]; then
        grep -E "^\s*version\s+['\"]" "${INIT_RB}" | sed -E "s/^.*version[[:space:]]+['\"]([^'\"]+)['\"].*/\1/" | head -1 || echo ""
    else
        echo ""
    fi
}

# Get latest git tag
get_latest_tag() {
    git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo ""
}

# Parse version string (MAJOR.MINOR.PATCH-rcRC or MAJOR.MINOR.PATCH)
parse_version() {
    local version="$1"
    if [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(-rc([0-9]+))?$ ]]; then
        MAJOR="${BASH_REMATCH[1]}"
        MINOR="${BASH_REMATCH[2]}"
        PATCH="${BASH_REMATCH[3]}"
        RC="${BASH_REMATCH[5]:-}"
    else
        echo "Error: Invalid version format: $version" >&2
        exit 1
    fi
}

# Bump version based on type
bump_version() {
    local bump_type="$1"
    
    case "$bump_type" in
        major)
            MAJOR=$((MAJOR + 1))
            MINOR=0
            PATCH=0
            RC=""
            ;;
        minor)
            MINOR=$((MINOR + 1))
            PATCH=0
            RC=""
            ;;
        patch)
            PATCH=$((PATCH + 1))
            RC=""
            ;;
        rc)
            if [ -z "$RC" ]; then
                RC=1
            else
                RC=$((RC + 1))
            fi
            ;;
        release)
            if [ -z "$RC" ]; then
                echo "Error: Current version is not an RC version" >&2
                exit 1
            fi
            RC=""
            ;;
        *)
            echo "Error: Invalid bump type: $bump_type" >&2
            echo "Usage: $0 [major|minor|patch|rc|release]" >&2
            exit 1
            ;;
    esac
    
    # Build new version string
    if [ -n "$RC" ]; then
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}-rc${RC}"
    else
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
    fi
}

# Update version in all files
update_version_files() {
    local new_version="$1"
    
    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] Would update versions to: ${new_version}"
        echo ""
        
        # Show what would change in init.rb
        if [ -f "${INIT_RB}" ]; then
            local current_line=$(grep -E "^\s*version\s+['\"]" "${INIT_RB}")
            echo "  ${INIT_RB}:"
            echo "    - ${current_line}"
            echo "    + version '${new_version}'"
        fi
        
        # Show what would change in package.json
        if [ -f "${PACKAGE_JSON}" ]; then
            local current_line=$(grep -E '"version"' "${PACKAGE_JSON}")
            echo "  ${PACKAGE_JSON}:"
            echo "    - ${current_line}"
            echo "    +   \"version\": \"${new_version}\","
        fi
        return
    fi
    
    # Update init.rb (Redmine plugin version)
    if [ -f "${INIT_RB}" ]; then
        if [[ "$(uname)" == "Darwin" ]]; then
            sed -i '' "s/version '[^']*'/version '${new_version}'/" "${INIT_RB}"
        else
            sed -i "s/version '[^']*'/version '${new_version}'/" "${INIT_RB}"
        fi
        echo "✓ Updated ${INIT_RB} to version ${new_version}"
    fi
    
    # Update package.json
    if [ -f "${PACKAGE_JSON}" ]; then
        if [[ "$(uname)" == "Darwin" ]]; then
            sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${new_version}\"/" "${PACKAGE_JSON}"
        else
            sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${new_version}\"/" "${PACKAGE_JSON}"
        fi
        echo "✓ Updated ${PACKAGE_JSON} to version ${new_version}"
    fi
}

# Commit version changes
commit_version_changes() {
    local new_version="$1"
    local commit_message="Bump version to ${new_version}"
    
    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] Would commit version changes:"
        echo "  Message: \"${commit_message}\""
        return 0
    fi
    
    # Stage the version files
    if [ -f "${INIT_RB}" ]; then
        git add "${INIT_RB}"
    fi
    if [ -f "${PACKAGE_JSON}" ]; then
        git add "${PACKAGE_JSON}"
    fi
    
    # Check if there are staged changes
    if ! git diff --staged --quiet; then
        git commit -m "${commit_message}"
        echo "✓ Committed version changes"
        return 0
    else
        echo "No changes to commit"
        return 0
    fi
}

# Create git tag
create_tag() {
    local version="$1"
    local tag="v${version}"
    
    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] Would create git tag: ${tag}"
        echo "  Message: \"Version ${version}\""
        
        # Check if tag already exists
        if git rev-parse "${tag}" >/dev/null 2>&1; then
            echo "  Warning: Tag ${tag} already exists"
        fi
        return
    fi
    
    # Check if tag already exists
    if git rev-parse "${tag}" >/dev/null 2>&1; then
        echo "Warning: Tag ${tag} already exists" >&2
        if [ "$YES" != true ]; then
            read -p "Continue anyway? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        else
            echo "Continuing anyway (--yes flag set)" >&2
        fi
    fi
    
    # Create tag
    git tag -a "${tag}" -m "Version ${version}"
    echo "✓ Created git tag: ${tag}"
}

# Push git tag
push_tag() {
    local version="$1"
    local tag="v${version}"
    
    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] Would push git tag: ${tag}"
        return
    fi
    
    git push origin "${tag}"
    echo "✓ Pushed git tag: ${tag}"
}

# Main execution
main() {
    local bump_type=""
    local make_rc=false
    local args=("$@")
    
    # Parse arguments
    local i=0
    while [ $i -lt ${#args[@]} ]; do
        local arg="${args[$i]}"
        case "$arg" in
            --dry-run)
                DRY_RUN=true
                ;;
            --push)
                PUSH=true
                ;;
            -y|--yes)
                YES=true
                ;;
            major|minor|patch)
                bump_type="$arg"
                # Check if next argument is "rc"
                if [ $((i + 1)) -lt ${#args[@]} ] && [ "${args[$((i + 1))]}" = "rc" ]; then
                    make_rc=true
                    ((i++))  # Skip next arg
                fi
                ;;
            rc)
                if [ -z "$bump_type" ]; then
                    bump_type="rc"
                else
                    make_rc=true
                fi
                ;;
            release)
                bump_type="release"
                ;;
            *)
                if [ -z "$bump_type" ] && [[ ! "$arg" =~ ^-- ]]; then
                    bump_type="$arg"
                fi
                ;;
        esac
        ((i++))
    done
    
    if [ -z "$bump_type" ]; then
        echo "Redmine Yjs Plugin Version Bumper"
        echo ""
        echo "Usage: $0 [major|minor|patch|rc|release] [rc] [--dry-run] [--push] [-y|--yes]"
        echo ""
        echo "Examples:"
        echo "  $0 major           # 1.2.3 -> 2.0.0"
        echo "  $0 major rc        # 1.2.3 -> 2.0.0-rc1"
        echo "  $0 minor           # 1.2.3 -> 1.3.0"
        echo "  $0 minor rc        # 1.2.3 -> 1.3.0-rc1"
        echo "  $0 patch           # 1.2.3 -> 1.2.4"
        echo "  $0 patch rc        # 1.2.3 -> 1.2.4-rc1"
        echo "  $0 rc              # 1.2.3 -> 1.2.3-rc1"
        echo "  $0 release         # 1.2.3-rc2 -> 1.2.3"
        echo ""
        echo "Current version: $(get_current_version)"
        echo ""
        echo "Options:"
        echo "  --dry-run    Show what would change without making changes"
        echo "  --push       Push the git tag to remote after creating it"
        echo "  -y, --yes    Auto-confirm all prompts"
        echo ""
        echo "Files updated:"
        echo "  - init.rb      (Redmine plugin version)"
        echo "  - package.json (npm version)"
        exit 1
    fi
    
    # Get current version
    CURRENT_VERSION=$(get_current_version)
    if [ -z "$CURRENT_VERSION" ]; then
        CURRENT_VERSION=$(get_latest_tag)
    fi
    
    if [ -z "$CURRENT_VERSION" ]; then
        echo "Error: Could not determine current version" >&2
        echo "Please set version in ${INIT_RB} or create an initial git tag" >&2
        exit 1
    fi
    
    echo "Current version: ${CURRENT_VERSION}"
    
    if [ "$DRY_RUN" = true ]; then
        echo ""
        echo "=== DRY RUN MODE ==="
        echo "No changes will be made."
        echo ""
    fi
    
    # Parse and bump
    parse_version "$CURRENT_VERSION"
    
    # If make_rc is true, add rc after bumping
    if [ "$make_rc" = true ] && [ "$bump_type" != "rc" ] && [ "$bump_type" != "release" ]; then
        bump_version "$bump_type"
        RC=1
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}-rc${RC}"
    else
        bump_version "$bump_type"
    fi
    
    echo "New version: ${NEW_VERSION}"
    echo ""
    
    # Update all version files
    update_version_files "$NEW_VERSION"
    
    if [ "$DRY_RUN" = true ]; then
        echo ""
        commit_version_changes "$NEW_VERSION"
        echo ""
        create_tag "$NEW_VERSION"
        if [ "$PUSH" = true ]; then
            push_tag "$NEW_VERSION"
        fi
        echo ""
        echo "=== DRY RUN COMPLETE ==="
        echo "Run without --dry-run to apply changes."
        exit 0
    fi
    
    # Ask for confirmation to commit and tag
    if [ "$YES" = true ]; then
        commit_version_changes "$NEW_VERSION"
        create_tag "$NEW_VERSION"
        
        if [ "$PUSH" = true ]; then
            echo ""
            push_tag "$NEW_VERSION"
        fi
        
        echo ""
        echo "✓ Version bumped to ${NEW_VERSION}"
        echo "✓ Changes committed"
        echo "✓ Git tag v${NEW_VERSION} created"
        if [ "$PUSH" = true ]; then
            echo "✓ Tag pushed to remote"
        fi
    else
        read -p "Commit and tag v${NEW_VERSION}? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            commit_version_changes "$NEW_VERSION"
            create_tag "$NEW_VERSION"
            
            if [ "$PUSH" = true ]; then
                echo ""
                push_tag "$NEW_VERSION"
            fi
            
            echo ""
            echo "✓ Version bumped to ${NEW_VERSION}"
            echo "✓ Changes committed"
            echo "✓ Git tag v${NEW_VERSION} created"
            if [ "$PUSH" = true ]; then
                echo "✓ Tag pushed to remote"
            fi
        else
            echo "Cancelled. Version updated in files only."
        fi
    fi
}

main "$@"

