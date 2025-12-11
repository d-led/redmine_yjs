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

# Configure CKEditor if plugin is installed
if [ -d "plugins/redmine_ckeditor" ]; then
  echo "Configuring CKEditor plugin..."
  bundle exec rails runner "
    # Set text formatting to CKEditor
    Setting.text_formatting = 'CKEditor' unless Setting.text_formatting == 'CKEditor'
    
    # Configure CKEditor plugin settings if not already set
    if Setting.find_by(name: 'plugin_redmine_ckeditor').nil?
      Setting.plugin_redmine_ckeditor = {
        'skin' => 'moono-lisa',
        'ui_color' => '#f4f4f4',
        'height' => '400',
        'enter_mode' => '1',
        'show_blocks' => '1',
        'toolbar_can_collapse' => '1',
        'toolbar_location' => 'top'
      }
      puts '[Test Setup] CKEditor plugin configured'
    end
  " RAILS_ENV=production 2>/dev/null || echo "Warning: Could not configure CKEditor"
fi

# Configure Yjs plugin WebSocket proxy mode if HOCUSPOCUS_INTERNAL_URL is set
if [ -n "${HOCUSPOCUS_INTERNAL_URL}" ]; then
  echo "Enabling Yjs WebSocket proxy mode..."
  bundle exec rails runner "
    settings = Setting.plugin_redmine_yjs || {}
    settings['websocket_proxy'] = '1'
    settings['hocuspocus_internal_url'] = '${HOCUSPOCUS_INTERNAL_URL}'
    Setting.plugin_redmine_yjs = settings
    puts '[Test Setup] Yjs WebSocket proxy enabled'
  " RAILS_ENV=production 2>/dev/null || echo "Warning: Could not configure Yjs proxy"
fi

# Clear cache
bundle exec rake tmp:cache:clear RAILS_ENV=production 2>/dev/null || true

# Start Rails
exec bundle exec rails server -b 0.0.0.0 -p 3000

