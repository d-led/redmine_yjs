#!/bin/bash
# Stop script for Redmine with OAuth2 Proxy setup
# This script stops all services (Redmine, Hocuspocus, and OAuth2 Proxy)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🛑 Stopping Redmine with OAuth2 Proxy services..."
echo ""

# Stop services
docker-compose down

echo ""
echo "✅ All services stopped successfully!"
echo ""

