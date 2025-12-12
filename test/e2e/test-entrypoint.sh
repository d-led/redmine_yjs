#!/bin/bash
set -e

cd /usr/src/redmine

# Create SQLite database config
if [ "${REDMINE_DB_SQLITE}" = "true" ]; then
  mkdir -p /data/db
  # Use container name or hostname to ensure unique database per instance
  DB_NAME="${CONTAINER_NAME:-redmine}"
  DB_FILE="/data/db/${DB_NAME}.sqlite3"
  cat > config/database.yml << DBCONF
production:
  adapter: sqlite3
  database: ${DB_FILE}
  timeout: 5000
DBCONF
  echo "[Test Setup] Using isolated database: ${DB_FILE}"
fi

# Ensure bundle is set up (in case some dependencies failed during build)
bundle config set --local without 'development test' || true

# Run migrations
bundle exec rake db:migrate RAILS_ENV=production 2>/dev/null || bundle exec rake db:migrate RAILS_ENV=production
bundle exec rake redmine:plugins:migrate RAILS_ENV=production || true

# Load default data if needed
if [ "${REDMINE_LOAD_DEFAULT_DATA}" = "true" ]; then
  bundle exec rake redmine:load_default_data RAILS_ENV=production REDMINE_LANG=${REDMINE_LANG:-en} 2>/dev/null || true
fi

# Set admin password
if [ -n "${REDMINE_ADMIN_PASSWORD}" ]; then
  bundle exec rails runner "u=User.find_by_login('admin'); u.password=u.password_confirmation='${REDMINE_ADMIN_PASSWORD}'; u.must_change_passwd=false; u.save!" RAILS_ENV=production 2>/dev/null || true
fi


# Clear cache
bundle exec rake tmp:cache:clear RAILS_ENV=production 2>/dev/null || true

# Start Rails
exec bundle exec rails server -b 0.0.0.0 -p 3000

