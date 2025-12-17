#!/bin/bash
# Logs script for Redmine with OAuth2 Proxy setup
# This script shows logs from all services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse arguments
FOLLOW=false
SERVICE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--follow)
      FOLLOW=true
      shift
      ;;
    *)
      SERVICE="$1"
      shift
      ;;
  esac
done

echo "📋 Showing logs for Redmine with OAuth2 Proxy..."
echo ""

if [ -n "$SERVICE" ]; then
  echo "Service: $SERVICE"
  echo ""
  if [ "$FOLLOW" = true ]; then
    docker-compose logs -f "$SERVICE"
  else
    docker-compose logs "$SERVICE"
  fi
else
  echo "All services (use './logs.sh <service>' for specific service)"
  echo "Available services: redmine, hocuspocus, oauth2-proxy"
  echo ""
  if [ "$FOLLOW" = true ]; then
    docker-compose logs -f
  else
    docker-compose logs
  fi
fi

