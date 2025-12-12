require 'redmine'

base_path = File.dirname(__FILE__)
if Rails.configuration.respond_to?(:autoloader) && Rails.configuration.autoloader == :zeitwerk
  Rails.autoloaders.each { |loader| loader.ignore("#{base_path}/lib") }
end

require "#{base_path}/lib/redmine_yjs"
require "#{base_path}/lib/redmine_yjs/application_helper_patch"
require "#{base_path}/lib/redmine_yjs/hooks"

ActiveSupport::Reloader.to_prepare do
  # Apply patches to ApplicationHelper (like CKEditor does)
  unless ApplicationHelper.included_modules.include?(RedmineYjs::ApplicationHelperPatch)
    ApplicationHelper.send(:include, RedmineYjs::ApplicationHelperPatch)
    Rails.logger.info "[Yjs] ApplicationHelper patch included"
  end
  
  # Register helper with ApplicationController so it's available in views and hooks
  if defined?(ApplicationController)
    ApplicationController.send(:helper, RedmineYjs::ApplicationHelperPatch)
    Rails.logger.info "[Yjs] Helper registered with ApplicationController"
  end
end

Redmine::Plugin.register :redmine_yjs do
  name 'Redmine Yjs Collaborative Editing'
  author 'Redmine Yjs Plugin'
  description 'Integrates Yjs CRDT-based collaborative editing with Redmine editors using Hocuspocus server'
  version '1.0.0'
  url 'https://github.com/your-org/redmine_yjs'
  author_url 'https://github.com/your-org'
  
  # Requires Redmine 5.0+ (Rails 6.1+, Ruby 3.0+)
  requires_redmine version_or_higher: '5.0.0'

  settings(
    default: {
      # Enable Yjs by default
      'yjs_enabled' => (ENV['YJS_ENABLED'] || '1'),
      
      # Hocuspocus WebSocket URL (browser connects directly)
      'hocuspocus_url' => ENV['HOCUSPOCUS_URL'] || 
        (File.exist?('/.dockerenv') ? 'ws://localhost:3000/ws' : 
         (Rails.env.production? ? 'wss://hocuspocus.fly.dev' : 'ws://localhost:8081'))
    },
    partial: 'settings/yjs'
  )
end

# Assets are copied during Docker build, not at runtime
# See redmine/Dockerfile for asset copying

