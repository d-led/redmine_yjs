#!/bin/bash
# Test runner with timeout to ensure tests terminate
# Usage: ./test-runner.sh [cucumber-args...]

set -e

# Maximum test duration (10 minutes)
MAX_DURATION=${TEST_TIMEOUT:-600}

# Run cucumber with timeout (using npx to avoid requiring global installation)
EXIT_CODE=0
timeout ${MAX_DURATION} npx --yes cucumber-js "$@" || EXIT_CODE=$?

# If timeout occurred, exit with 124 (standard timeout exit code)
if [ "${EXIT_CODE}" -eq 124 ]; then
  echo ""
  echo "❌ Tests exceeded maximum duration of ${MAX_DURATION}s"
  echo "   Set TEST_TIMEOUT environment variable to change this limit"
  exit 124
fi

# Otherwise, pass through the exit code
exit ${EXIT_CODE}

