#!/bin/bash
# Run E2E tests for Redmine Yjs collaborative editing plugin
#
# Usage:
#   ./scripts/run-tests.sh           # Run all tests
#   ./scripts/run-tests.sh --visible # Run with visible browser
#   ./scripts/run-tests.sh --setup   # Only start services, don't run tests
#   ./scripts/run-tests.sh --cleanup # Only cleanup services
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
VISIBLE=false
SETUP_ONLY=false
CLEANUP_ONLY=false
TAGS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --visible)
      VISIBLE=true
      shift
      ;;
    --setup)
      SETUP_ONLY=true
      shift
      ;;
    --cleanup)
      CLEANUP_ONLY=true
      shift
      ;;
    --tags)
      TAGS="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--visible] [--setup] [--cleanup] [--tags @tagname]"
      exit 1
      ;;
  esac
done

# Detect platform for host binding
if [[ "$(uname)" == "Darwin" ]]; then
  HOST="0.0.0.0"
else
  HOST="127.0.0.1"
fi

COMPOSE_FILE="$E2E_DIR/docker compose.test.yml"

echo "========================================"
echo "Redmine Yjs E2E Test Runner"
echo "========================================"
echo "Platform: $(uname)"
echo "Host: $HOST"
echo ""

# Cleanup function
cleanup() {
  echo ""
  echo "🧹 Cleaning up Docker services..."
  cd "$E2E_DIR"
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
  echo "✅ Cleanup complete"
}

# Cleanup only mode
if $CLEANUP_ONLY; then
  cleanup
  exit 0
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker first."
  exit 1
fi

# Start services
echo "🐳 Starting Docker services..."
cd "$E2E_DIR"
docker compose -f "$COMPOSE_FILE" up --build -d

echo "✅ Docker services started"
echo "   (TypeScript tests will wait for services to be fully ready)"

if $SETUP_ONLY; then
  echo ""
  echo "✅ Services started!"
  echo "   Redmine:    http://$HOST:3000/"
  echo "   Hocuspocus: ws://$HOST:8081/"
  echo ""
  echo "To run tests manually:"
  echo "   cd $E2E_DIR"
  echo "   npm test"
  echo ""
  echo "To cleanup:"
  echo "   $0 --cleanup"
  exit 0
fi

# Install dependencies if needed
echo ""
echo "📦 Checking test dependencies..."

if [ ! -d "node_modules" ]; then
  echo "Installing npm dependencies..."
  npm install
fi

# Check Playwright browsers
if ! npx playwright install --check 2>/dev/null; then
  echo "Installing Playwright browsers..."
  npx playwright install chromium
fi

# Run tests
echo ""
echo "🧪 Running E2E tests..."
echo "   (Tests will wait for Redmine and Hocuspocus to be fully ready)"
echo ""

# Build test command
TEST_CMD="npm test"

if [ -n "$TAGS" ]; then
  TEST_CMD="$TEST_CMD -- --tags $TAGS"
fi

# Set environment variables
export SUT_BASE_URL="http://$HOST:3000"
export HOCUSPOCUS_URL="http://$HOST:8081"
export HOCUSPOCUS_WS_URL="ws://$HOST:8081"

if $VISIBLE; then
  export HEADLESS=false
  export SLOW_MO=200
fi

# Create reports directory
mkdir -p reports/screenshots

# Trap to ensure cleanup on exit (success or failure)
trap cleanup EXIT

# Run tests
$TEST_CMD
TEST_EXIT_CODE=$?

echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ Tests completed successfully!"
else
  echo "❌ Tests failed with exit code $TEST_EXIT_CODE"
fi

echo "View report: npm run test:report"

exit $TEST_EXIT_CODE
