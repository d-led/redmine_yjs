#!/bin/bash
# Run all tests for Redmine Yjs plugin
#
# This script runs:
# 1. Ruby unit/integration tests (requires Redmine checkout + PostgreSQL)
# 2. E2E tests (requires Docker Compose with Redmine + Hocuspocus)
#
# Usage:
#   ./scripts/run_all_tests.sh              # Run all tests
#   ./scripts/run_all_tests.sh --ruby-only  # Run only Ruby tests
#   ./scripts/run_all_tests.sh --e2e-only   # Run only E2E tests
#   ./scripts/run_all_tests.sh --skip-setup  # Skip Docker setup (assumes services running)
#   ./scripts/run_all_tests.sh --cleanup    # Cleanup Docker services only
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
E2E_DIR="$PLUGIN_DIR/test/e2e"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
RUBY_ONLY=false
E2E_ONLY=false
SKIP_SETUP=false
CLEANUP_ONLY=false
VISIBLE=false
TAGS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --ruby-only)
      RUBY_ONLY=true
      shift
      ;;
    --e2e-only)
      E2E_ONLY=true
      shift
      ;;
    --skip-setup)
      SKIP_SETUP=true
      shift
      ;;
    --cleanup)
      CLEANUP_ONLY=true
      shift
      ;;
    --visible)
      VISIBLE=true
      shift
      ;;
    --tags)
      TAGS="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--ruby-only] [--e2e-only] [--skip-setup] [--cleanup] [--visible] [--tags @tagname]"
      exit 1
      ;;
  esac
done

# Helper functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

log_section() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# Cleanup function
cleanup_docker() {
  log_section "Cleaning up Docker services"
  cd "$E2E_DIR"
  if [ -f "docker-compose.test.yml" ]; then
    docker compose -f docker-compose.test.yml down -v --remove-orphans 2>/dev/null || true
    log_success "Docker services cleaned up"
  else
    log_warning "docker-compose.test.yml not found, skipping cleanup"
  fi
}

# Check prerequisites
check_prerequisites() {
  log_section "Checking prerequisites"
  
  # Check Docker
  if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
  fi
  
  if ! docker info &> /dev/null; then
    log_error "Docker is not running"
    exit 1
  fi
  log_success "Docker is available"
  
  # Check docker compose
  if ! docker compose version &> /dev/null; then
    log_error "docker compose is not available"
    exit 1
  fi
  log_success "docker compose is available"
  
  # Check Node.js/npm for E2E tests (we'll use npx, so npm is sufficient)
  if [ "$E2E_ONLY" = false ] && [ "$RUBY_ONLY" = false ]; then
    if ! command -v npm &> /dev/null; then
      log_error "npm is not installed (required for E2E tests)"
      log_info "Install Node.js which includes npm: https://nodejs.org/"
      exit 1
    fi
    log_success "npm is available (will use npx for commands)"
  fi
  
  # Check Ruby for Ruby tests
  if [ "$E2E_ONLY" = false ] && [ "$RUBY_ONLY" = false ]; then
    if ! command -v ruby &> /dev/null; then
      log_warning "Ruby is not installed (Ruby tests will be skipped)"
    else
      log_success "Ruby is available"
    fi
  fi
}

# Run Ruby tests
run_ruby_tests() {
  log_section "Running Ruby Tests"
  
  # Check if Redmine checkout exists
  REDMINE_DIR="${REDMINE_DIR:-../redmine}"
  if [ ! -d "$REDMINE_DIR" ]; then
    log_warning "Redmine directory not found at $REDMINE_DIR"
    log_info "To run Ruby tests, checkout Redmine:"
    log_info "  git clone https://github.com/redmine/redmine.git $REDMINE_DIR"
    log_info "  cd $REDMINE_DIR && git checkout 6.0-stable"
    log_info "  cd $REDMINE_DIR/plugins/redmine_yjs && ln -s ../../../redmine_yjs ."
    log_info ""
    log_info "Or set REDMINE_DIR environment variable:"
    log_info "  export REDMINE_DIR=/path/to/redmine"
    log_info "  $0 --ruby-only"
    return 1
  fi
  
  # Check if plugin is symlinked
  PLUGIN_LINK="$REDMINE_DIR/plugins/redmine_yjs"
  if [ ! -L "$PLUGIN_LINK" ] && [ ! -d "$PLUGIN_LINK" ]; then
    log_warning "Plugin not found in Redmine plugins directory"
    log_info "Creating symlink: ln -s $PLUGIN_DIR $PLUGIN_LINK"
    mkdir -p "$REDMINE_DIR/plugins"
    ln -sf "$PLUGIN_DIR" "$PLUGIN_LINK"
    log_success "Symlink created"
  fi
  
  # Check PostgreSQL
  if ! command -v psql &> /dev/null; then
    log_warning "PostgreSQL client not found, checking Docker..."
    if docker ps | grep -q postgres; then
      log_info "PostgreSQL container found"
    else
      log_warning "PostgreSQL not available. Ruby tests require PostgreSQL."
      log_info "Start PostgreSQL with Docker:"
      log_info "  docker run -d --name redmine_postgres -e POSTGRES_USER=redmine -e POSTGRES_PASSWORD=redmine -e POSTGRES_DB=redmine_test -p 5432:5432 postgres:15"
      return 1
    fi
  fi
  
  cd "$REDMINE_DIR"
  
  # Check database.yml
  if [ ! -f "config/database.yml" ]; then
    log_info "Creating database.yml for testing..."
    mkdir -p config
    cat > config/database.yml << EOF
test:
  adapter: postgresql
  database: redmine_test
  host: localhost
  username: redmine
  password: redmine
  encoding: utf8
EOF
    log_success "database.yml created"
  fi
  
  # Install dependencies if needed
  if [ ! -d "vendor/bundle" ]; then
    log_info "Installing Ruby dependencies..."
    bundle config set --local without 'development'
    bundle install --jobs 4 --retry 3 || {
      log_error "Failed to install Ruby dependencies"
      return 1
    }
  fi
  
  # Setup database
  log_info "Setting up database..."
  RAILS_ENV=test bundle exec rake db:create db:migrate || {
    log_error "Failed to setup database"
    return 1
  }
  
  # Run plugin migrations
  log_info "Running plugin migrations..."
  RAILS_ENV=test bundle exec rake redmine:plugins:migrate || {
    log_error "Failed to run plugin migrations"
    return 1
  }
  
  # Run tests
  log_info "Running Ruby tests..."
  if RAILS_ENV=test bundle exec rake test TEST="plugins/redmine_yjs/test/**/*_test.rb" TESTOPTS="--verbose"; then
    log_success "Ruby tests passed"
    return 0
  else
    log_error "Ruby tests failed"
    return 1
  fi
}

# Run E2E tests
run_e2e_tests() {
  log_section "Running E2E Tests"
  
  cd "$E2E_DIR"
  
  # Check if package.json exists
  if [ ! -f "package.json" ]; then
    log_error "package.json not found in $E2E_DIR"
    return 1
  fi
  
  # Install dependencies if needed (use npx npm to avoid requiring global npm)
  if [ ! -d "node_modules" ]; then
    log_info "Installing npm dependencies..."
    if command -v npm &> /dev/null; then
      npm install || {
        log_error "Failed to install npm dependencies"
        return 1
      }
    else
      log_error "npm is not available"
      return 1
    fi
  fi
  
  # Install Playwright browsers if needed (using npx)
  if ! npx --yes playwright install --check chromium &> /dev/null 2>&1; then
    log_info "Installing Playwright browsers..."
    npx --yes playwright install chromium --with-deps || {
      log_error "Failed to install Playwright browsers"
      return 1
    }
  fi
  
  # Start Docker services if not skipping setup
  if [ "$SKIP_SETUP" = false ]; then
    log_info "Starting Docker services..."
    docker compose -f docker-compose.test.yml up --build -d || {
      log_error "Failed to start Docker services"
      return 1
    }
    DOCKER_STARTED=true  # Mark that we started services
    log_success "Docker services started"
    
    # Wait for services to be ready by checking HTTP endpoints directly
    # This is more reliable than waiting for Docker healthchecks
    log_info "Waiting for services to be ready (this may take a few minutes)..."
    MAX_WAIT=600  # 10 minutes max (Redmine can take a while to start)
    ELAPSED=0
    
    # Detect host for curl (macOS uses 0.0.0.0, Linux uses 127.0.0.1)
    if [[ "$(uname)" == "Darwin" ]]; then
      HOST="0.0.0.0"
    else
      HOST="127.0.0.1"
    fi
    
    REDMINE_READY=false
    REDMINE_PROXY_READY=false
    HOCUSPOCUS_READY=false
    
    while [ $ELAPSED -lt $MAX_WAIT ]; do
      # Check Hocuspocus
      if [ "$HOCUSPOCUS_READY" = false ]; then
        if curl -sf "http://${HOST}:8081/health" > /dev/null 2>&1; then
          HOCUSPOCUS_READY=true
          log_success "Hocuspocus is ready"
        fi
      fi
      
      # Check Redmine (direct mode)
      if [ "$REDMINE_READY" = false ]; then
        if curl -sf "http://${HOST}:3000/login" | grep -q "username" > /dev/null 2>&1; then
          REDMINE_READY=true
          log_success "Redmine (direct) is ready"
        fi
      fi
      
      # Check Redmine (proxy mode)
      if [ "$REDMINE_PROXY_READY" = false ]; then
        if curl -sf "http://${HOST}:3001/login" | grep -q "username" > /dev/null 2>&1; then
          REDMINE_PROXY_READY=true
          log_success "Redmine (proxy) is ready"
        fi
      fi
      
      # Check if all required services are ready
      if [ "$HOCUSPOCUS_READY" = true ] && [ "$REDMINE_READY" = true ] && [ "$REDMINE_PROXY_READY" = true ]; then
        log_success "All required services are ready!"
        break
      fi
      
      if [ $((ELAPSED % 30)) -eq 0 ]; then
        log_info "Waiting for services... (${ELAPSED}s elapsed)"
        log_info "  Hocuspocus: $([ "$HOCUSPOCUS_READY" = true ] && echo "✓ ready" || echo "⏳ waiting")"
        log_info "  Redmine (direct): $([ "$REDMINE_READY" = true ] && echo "✓ ready" || echo "⏳ waiting")"
        log_info "  Redmine (proxy): $([ "$REDMINE_PROXY_READY" = true ] && echo "✓ ready" || echo "⏳ waiting")"
      fi
      
      sleep 5
      ELAPSED=$((ELAPSED + 5))
    done
    
    if [ "$HOCUSPOCUS_READY" = false ] || [ "$REDMINE_READY" = false ] || [ "$REDMINE_PROXY_READY" = false ]; then
      log_error "Some services are not ready after ${MAX_WAIT}s"
      log_info "Check status with: docker compose -f docker-compose.test.yml ps"
      log_info "Check logs with: docker compose -f docker-compose.test.yml logs redmine"
      log_info "Check logs with: docker compose -f docker-compose.test.yml logs redmine-proxy"
      return 1
    fi
  else
    log_info "Skipping Docker setup (assuming services are running)"
  fi
  
  # Build test command (use npm run test which calls test-runner.sh)
  # The test-runner.sh uses npx cucumber-js, so we're already using npx
  TEST_CMD="npm test"
  
  if [ -n "$TAGS" ]; then
    TEST_CMD="$TEST_CMD -- --tags $TAGS"
  fi
  
  if [ "$VISIBLE" = true ]; then
    export HEADLESS=false
    export SLOW_MO=200
  fi
  
  # Create reports directory
  mkdir -p reports/screenshots
  
  # Run tests (npm test will use npx via test-runner.sh)
  log_info "Running E2E tests..."
  if $TEST_CMD; then
    log_success "E2E tests passed"
    return 0
  else
    log_error "E2E tests failed"
    return 1
  fi
}

# Main execution
main() {
  echo ""
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║${NC}     Redmine Yjs Plugin - Test Runner                  ${GREEN}║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  # Cleanup only mode
  if [ "$CLEANUP_ONLY" = true ]; then
    cleanup_docker
    exit 0
  fi
  
  # Check prerequisites
  check_prerequisites
  
  # Track results
  RUBY_RESULT=0
  E2E_RESULT=0
  
  # Run Ruby tests
  if [ "$E2E_ONLY" = false ]; then
    if run_ruby_tests; then
      RUBY_RESULT=0
    else
      RUBY_RESULT=1
      if [ "$RUBY_ONLY" = true ]; then
        exit 1
      fi
    fi
  fi
  
  # Run E2E tests
  if [ "$RUBY_ONLY" = false ]; then
    if run_e2e_tests; then
      E2E_RESULT=0
    else
      E2E_RESULT=1
    fi
  fi
  
  # Summary
  log_section "Test Summary"
  
  if [ "$E2E_ONLY" = false ]; then
    if [ $RUBY_RESULT -eq 0 ]; then
      log_success "Ruby tests: PASSED"
    else
      log_error "Ruby tests: FAILED"
    fi
  fi
  
  if [ "$RUBY_ONLY" = false ]; then
    if [ $E2E_RESULT -eq 0 ]; then
      log_success "E2E tests: PASSED"
    else
      log_error "E2E tests: FAILED"
    fi
  fi
  
  # Note: Cleanup is handled by trap, but only if DOCKER_STARTED=true
  # We don't need to cleanup here explicitly since the trap will handle it
  
  # Exit with appropriate code
  if [ $RUBY_RESULT -eq 0 ] && [ $E2E_RESULT -eq 0 ]; then
    log_success "All tests passed!"
    exit 0
  else
    log_error "Some tests failed"
    exit 1
  fi
}

# Track if we started Docker services
DOCKER_STARTED=false

# Cleanup function that checks if we should cleanup
safe_cleanup() {
  # Only cleanup if we started the services and not in cleanup-only mode
  if [ "$DOCKER_STARTED" = true ] && [ "$CLEANUP_ONLY" = false ]; then
    cleanup_docker
  fi
}

# Trap to ensure cleanup on exit (but only if we started services)
trap safe_cleanup EXIT INT TERM

# Run main function
main

