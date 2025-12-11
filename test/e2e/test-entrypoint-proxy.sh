#!/bin/bash
set -e

cd /usr/src/redmine

# Create SQLite database config
if [ "${REDMINE_DB_SQLITE}" = "true" ]; then
  mkdir -p /data/db
  cat > config/database.yml << DBCONF
production:
  adapter: sqlite3
  database: /data/db/redmine.sqlite3
  timeout: 5000
DBCONF
fi

# Copy ActionCable config (if provided)
if [ -f /usr/src/redmine/plugins/redmine_yjs/test/e2e/cable.yml ]; then
  cp /usr/src/redmine/plugins/redmine_yjs/test/e2e/cable.yml config/cable.yml
fi

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

# Configure Yjs plugin with WebSocket proxy mode enabled
bundle exec rails runner "
  begin
    if ActiveRecord::Base.connection.table_exists?('settings')
      hocuspocus_internal_url = ENV['HOCUSPOCUS_INTERNAL_URL'] || 'ws://hocuspocus:8081'
      Setting.plugin_redmine_yjs = {
        'yjs_enabled' => '1',
        'websocket_proxy' => '1',  # Enable ActionCable proxy mode
        'hocuspocus_url' => ENV['HOCUSPOCUS_URL'] || 'ws://localhost:8081',
        'hocuspocus_internal_url' => hocuspocus_internal_url
      }
      puts '[entrypoint-proxy] Yjs plugin configured with WebSocket proxy mode enabled'
      puts \"[entrypoint-proxy] Hocuspocus internal URL: #{hocuspocus_internal_url}\"
    end
  rescue => e
    puts \"[entrypoint-proxy] Error configuring Yjs plugin: #{e.message}\"
  end
" RAILS_ENV=production 2>&1 | grep -v "^I,\[" || true

# Clear cache
bundle exec rake tmp:cache:clear RAILS_ENV=production 2>/dev/null || true

# Start Rails
exec bundle exec rails server -b 0.0.0.0 -p 3000

