#!/bin/bash
# Stop test services
#
# This script stops and cleans up Docker Compose services for E2E tests.
#
# Usage:
#   ./scripts/stop_test_services.sh
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

# Cleanup function
cleanup_docker() {
  log_section "Cleaning up Docker services"
  cd "$E2E_DIR"
  if [ -f "docker-compose.test.yml" ]; then
    docker compose -f docker-compose.test.yml down -v --remove-orphans 2>/dev/null || {
      log_warning "Some services may have already been stopped"
    }
    log_success "Docker services cleaned up"
  else
    log_warning "docker-compose.test.yml not found, skipping cleanup"
  fi
}

# Main execution
main() {
  echo ""
  echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║${NC}     Redmine Yjs Plugin - Stop Test Services             ${GREEN}║${NC}"
  echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  cleanup_docker
  
  echo ""
  log_success "Test services stopped"
  echo ""
}

main "$@"

