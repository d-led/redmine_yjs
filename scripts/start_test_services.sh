#!/bin/bash
# Start test services in daemon mode
#
# This script starts Docker Compose services for E2E tests and waits for them to be ready.
# Services run in daemon mode (detached) and will continue running until stopped.
#
# Usage:
#   ./scripts/start_test_services.sh
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

# Helper functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_section() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
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
}

# Start Docker services
start_services() {
  log_section "Starting Docker services"
  cd "$E2E_DIR"
  
  if [ ! -f "docker-compose.yml" ]; then
    log_error "docker-compose.yml not found in $E2E_DIR"
    exit 1
  fi
  
  log_info "Starting services in daemon mode..."
  docker compose up --build -d || {
    log_error "Failed to start Docker services"
    exit 1
  }
  log_success "Docker services started"
}

# Wait for services to be ready
wait_for_services() {
  log_section "Waiting for services to be ready"
  
  # Detect host for curl (macOS uses 0.0.0.0, Linux uses 127.0.0.1)
  if [[ "$(uname)" == "Darwin" ]]; then
    HOST="0.0.0.0"
  else
    HOST="127.0.0.1"
  fi
  
  MAX_WAIT=600  # 10 minutes max (Redmine can take a while to start)
  ELAPSED=0
  
  REDMINE_READY=false
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
    
    # Check if all required services are ready
    if [ "$HOCUSPOCUS_READY" = true ] && [ "$REDMINE_READY" = true ]; then
      log_success "All required services are ready!"
      return 0
    fi
    
    if [ $((ELAPSED % 30)) -eq 0 ]; then
      log_info "Waiting for services... (${ELAPSED}s elapsed)"
      log_info "  Hocuspocus: $([ "$HOCUSPOCUS_READY" = true ] && echo "✓ ready" || echo "⏳ waiting")"
      log_info "  Redmine (direct): $([ "$REDMINE_READY" = true ] && echo "✓ ready" || echo "⏳ waiting")"
    fi
    
    sleep 5
    ELAPSED=$((ELAPSED + 5))
  done
  
  if [ "$HOCUSPOCUS_READY" = false ] || [ "$REDMINE_READY" = false ]; then
    log_error "Some services are not ready after ${MAX_WAIT}s"
    log_info "Check status with: cd test/e2e && docker compose ps"
    log_info "Check logs with: cd test/e2e && docker compose logs redmine"
    exit 1
  fi
}

# Main execution
main() {
  echo ""
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║${NC}     Redmine Yjs Plugin - Start Test Services          ${GREEN}║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  check_prerequisites
  start_services
  wait_for_services
  
  echo ""
  log_success "All test services are running in daemon mode"
  log_info "Services will continue running until stopped"
  log_info "To stop services, run: ./scripts/stop_test_services.sh"
  log_info "Or manually: cd test/e2e && docker compose down"
  echo ""
}

main "$@"

