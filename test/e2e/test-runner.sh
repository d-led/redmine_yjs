#!/bin/bash
# Test runner with timeout to ensure tests terminate
# Usage: ./test-runner.sh [cucumber-args...]

# Maximum test duration (10 minutes)
MAX_DURATION=${TEST_TIMEOUT:-600}

# Run cucumber with timeout (using npx to avoid requiring global installation)
# timeout will forward signals (SIGINT/SIGTERM) to the child process
EXIT_CODE=0
timeout ${MAX_DURATION} npx --yes cucumber-js "$@" || EXIT_CODE=$?

# If timeout occurred, exit with 124 (standard timeout exit code)
# Note: timeout returns 124 on timeout, but may return 128+signal on interrupt
if [ "${EXIT_CODE}" -eq 124 ]; then
  echo ""
  echo "❌ Tests exceeded maximum duration of ${MAX_DURATION}s"
  echo "   Set TEST_TIMEOUT environment variable to change this limit"
  exit 124
fi

# If interrupted (SIGINT = 130, SIGTERM = 143), forward it
# timeout may return 128+signal, so check for that too
if [ "${EXIT_CODE}" -eq 130 ] || [ "${EXIT_CODE}" -eq 143 ] || [ "${EXIT_CODE}" -ge 128 ]; then
  # Extract signal number if it's 128+signal
  if [ "${EXIT_CODE}" -ge 128 ]; then
    SIGNAL=$((EXIT_CODE - 128))
    # SIGINT = 2, SIGTERM = 15
    if [ "$SIGNAL" -eq 2 ] || [ "$SIGNAL" -eq 15 ]; then
      exit ${EXIT_CODE}
    fi
  else
    exit ${EXIT_CODE}
  fi
fi

# Otherwise, pass through the exit code
exit ${EXIT_CODE}

