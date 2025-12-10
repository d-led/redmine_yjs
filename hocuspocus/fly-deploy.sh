#!/bin/bash
# Deploy Hocuspocus to Fly.io
# Usage: ./fly-deploy.sh

set -e

echo "🚀 Deploying Hocuspocus to Fly.io..."

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "❌ flyctl not found. Install from https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# Check if logged in
if ! flyctl auth whoami &> /dev/null; then
    echo "🔐 Please log in to Fly.io..."
    flyctl auth login
fi

# Create app if it doesn't exist
if ! flyctl apps list | grep -q "redmine-hocuspocus"; then
    echo "📦 Creating Fly.io app..."
    flyctl apps create redmine-hocuspocus --org personal
fi

# Set up PostgreSQL database (if not already set)
if ! flyctl postgres list | grep -q "redmine-db"; then
    echo "💾 Creating PostgreSQL database..."
    flyctl postgres create --name redmine-db --region iad --vm-size shared-cpu-1x --volume-size 10
    echo "📝 Note: You'll need to set DATABASE_URL secret after database is created"
fi

# Get database connection string
echo "🔗 Setting up database connection..."
DB_URL=$(flyctl postgres connect -a redmine-db -c "SELECT 'postgresql://' || current_user || ':' || 'password' || '@' || inet_server_addr() || ':' || inet_server_port() || '/' || current_database();" 2>/dev/null | grep postgresql || echo "")

if [ -n "$DB_URL" ]; then
    flyctl secrets set DATABASE_URL="$DB_URL" -a redmine-hocuspocus
    echo "✅ Database URL set"
else
    echo "⚠️  Could not auto-detect database URL. Set it manually:"
    echo "   flyctl secrets set DATABASE_URL='postgresql://...' -a redmine-hocuspocus"
fi

# Deploy
echo "📤 Deploying..."
flyctl deploy --config fly.hocuspocus.toml -a redmine-hocuspocus

# Get the app URL
APP_URL=$(flyctl status -a redmine-hocuspocus | grep "Hostname" | awk '{print $2}' || echo "")
if [ -n "$APP_URL" ]; then
    echo ""
    echo "✅ Hocuspocus deployed successfully!"
    echo "🌐 WebSocket URL: wss://${APP_URL}"
    echo ""
    echo "📝 Update Redmine plugin settings with:"
    echo "   Hocuspocus URL: wss://${APP_URL}"
else
    echo "✅ Deployment complete! Check status with: flyctl status -a redmine-hocuspocus"
fi

