#!/bin/bash
set -e

cd /usr/src/redmine

# Create SQLite database config
if [ "${REDMINE_DB_SQLITE}" = "true" ]; then
  mkdir -p /data/db
  DB_NAME="${CONTAINER_NAME:-redmine}"
  DB_FILE="/data/db/${DB_NAME}.sqlite3"
  cat > config/database.yml << DBCONF
production:
  adapter: sqlite3
  database: ${DB_FILE}
  timeout: 5000
DBCONF
  echo "[OAuth2 Proxy Setup] Using database: ${DB_FILE}"
fi

# Ensure bundle is set up
bundle config set --local without 'development test' || true

# Run migrations
bundle exec rake db:migrate RAILS_ENV=production 2>/dev/null || bundle exec rake db:migrate RAILS_ENV=production
bundle exec rake redmine:plugins:migrate RAILS_ENV=production || true

# Load default data if needed
if [ "${REDMINE_LOAD_DEFAULT_DATA}" = "true" ]; then
  bundle exec rake redmine:load_default_data RAILS_ENV=production REDMINE_LANG=${REDMINE_LANG:-en} 2>/dev/null || true
fi

# Ensure admin user exists and set password
bundle exec rails runner "
  admin = User.find_by_login('admin') || User.new(login: 'admin', firstname: 'Redmine', lastname: 'Administrator', mail: 'admin@example.com')
  admin.password = admin.password_confirmation = '${REDMINE_ADMIN_PASSWORD:-admin123}'
  admin.must_change_passwd = false
  admin.admin = true
  admin.status = User::STATUS_ACTIVE
  admin.save!
  puts '[OAuth2 Proxy Setup] Admin user configured'
" RAILS_ENV=production 2>/dev/null || true

# Configure predefined users as admins from environment variable
# Format: REDMINE_ADMIN_EMAILS=user1@example.com,user2@example.com
if [ -n "${REDMINE_ADMIN_EMAILS}" ]; then
  bundle exec rails runner "
    admin_emails = ENV['REDMINE_ADMIN_EMAILS'].to_s.split(',').map(&:strip).reject(&:empty?)
    admin_emails.each do |email|
      user = User.find_by_mail(email)
      if user
        user.admin = true
        user.status = User::STATUS_ACTIVE
        user.save!
        puts \"[OAuth2 Proxy Setup] User #{email} configured as admin\"
      else
        puts \"[OAuth2 Proxy Setup] Warning: User with email #{email} not found. Will be created on first login via OAuth2.\"
      end
    end
  " RAILS_ENV=production 2>/dev/null || true
fi

# Clear cache
bundle exec rake tmp:cache:clear RAILS_ENV=production 2>/dev/null || true

echo "[OAuth2 Proxy Setup] Redmine is ready. Access via OAuth2 proxy or direct admin login."

# Start Rails on port 3000 (standard Redmine port)
# Explicitly set port to 3000, ignoring any PORT environment variable
PORT=3000 exec bundle exec rails server -b 0.0.0.0 -p 3000

