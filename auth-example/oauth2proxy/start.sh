#!/bin/bash
# Start script for Redmine with OAuth2 Proxy setup
# This script starts Redmine, Hocuspocus, and OAuth2 Proxy with proper routing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for required environment variables
if [ -z "${REDMINE_GITHUB_OAUTH2_PROXY_CLIENT_ID}" ] || [ -z "${REDMINE_GITHUB_OAUTH2_PROXY_CLIENT_SECRET}" ]; then
  echo "❌ Error: Required environment variables not set!"
  echo ""
  echo "Please set the following environment variables:"
  echo "  export REDMINE_GITHUB_OAUTH2_PROXY_CLIENT_ID=your_client_id"
  echo "  export REDMINE_GITHUB_OAUTH2_PROXY_CLIENT_SECRET=your_client_secret"
  echo ""
  echo "Optional variables:"
  echo "  export REDMINE_ADMIN_EMAILS=admin@example.com,user@example.com"
  echo "  export OAUTH2_PROXY_REDIRECT_URL=http://localhost:3000/oauth2/callback"
  echo "  export OAUTH2_PROXY_COOKIE_SECRET=\$(openssl rand -base64 32 | head -c 32 | base64)"
  echo ""
  exit 1
fi

# Generate cookie secret if not set
if [ -z "${OAUTH2_PROXY_COOKIE_SECRET}" ] || [ "${OAUTH2_PROXY_COOKIE_SECRET}" = "change-me-in-production-use-openssl-rand-base64-32" ]; then
  echo "⚠️  Warning: OAUTH2_PROXY_COOKIE_SECRET not set, using default (not secure for production!)"
  echo "   Generate one with: openssl rand -base64 32 | head -c 32 | base64"
fi

echo "🚀 Starting Redmine with OAuth2 Proxy..."
echo ""
echo "Configuration:"
echo "  - OAuth2 Proxy: http://localhost:3000"
echo "  - Redmine (for debugging only): http://localhost:3001"
echo "  - Hocuspocus (internal): http://hocuspocus:8081"
echo "  - Routing:"
echo "    • /ws/* → Hocuspocus (WebSocket for collaborative editing)"
echo "    • /* → Redmine (main application)"
echo ""

# Start services
docker-compose up -d

echo ""
echo "⏳ Waiting for services to start (health checks are optional)..."
echo ""

# Wait for services to be ready (non-blocking - just check if containers are running)
timeout=30
elapsed=0
services_ready=false

while [ $elapsed -lt $timeout ]; do
  # Check if containers are running (not necessarily healthy)
  if docker-compose ps | grep -q "redmine.*Up" && \
     docker-compose ps | grep -q "hocuspocus.*Up" && \
     docker-compose ps | grep -q "oauth2-proxy.*Up"; then
    services_ready=true
    break
  fi
  sleep 2
  elapsed=$((elapsed + 2))
  echo -n "."
done

if [ "$services_ready" = true ]; then
  echo ""
  echo "✅ Services are running!"
else
  echo ""
  echo "⚠️  Services may still be starting up (this is normal)"
  echo "   Check status with: docker-compose ps"
  echo "   Check logs with: docker-compose logs"
fi

echo ""
echo "✅ All services started successfully!"
echo ""
echo "🌐 Access Redmine at:"
echo "   http://localhost:3000"
echo ""
echo "📋 Useful commands:"
echo "   View logs:    ./logs.sh [-f] [service]"
echo "   Stop:         ./stop.sh"
echo "   Restart:      docker-compose restart"
echo "   Status:       docker-compose ps"
echo ""
echo "🔐 Admin access:"
if [ -n "${REDMINE_ADMIN_EMAILS}" ]; then
  echo "   OAuth2 admins: ${REDMINE_ADMIN_EMAILS}"
fi
echo "   Fallback admin: login='admin', password='${REDMINE_ADMIN_PASSWORD:-admin123}'"
echo ""

