require 'redmine'

base_path = File.dirname(__FILE__)
if Rails.configuration.respond_to?(:autoloader) && Rails.configuration.autoloader == :zeitwerk
  Rails.autoloaders.each { |loader| loader.ignore("#{base_path}/lib") }
end

require "#{base_path}/lib/redmine_yjs"
require "#{base_path}/lib/redmine_yjs/application_helper_patch"
require "#{base_path}/lib/redmine_yjs/hooks"
require "#{base_path}/lib/redmine_yjs/wiki_controller_patch"
require "#{base_path}/lib/redmine_yjs/issues_controller_patch"

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
  
  # Patch WikiController to bypass stale object check when Yjs is enabled
  if defined?(WikiController)
    unless WikiController.included_modules.include?(RedmineYjs::WikiControllerPatch)
      WikiController.send(:include, RedmineYjs::WikiControllerPatch)
      Rails.logger.info "[Yjs] WikiController patch included"
    end
  end
  
  # Patch IssuesController to bypass stale object check when Yjs is enabled
  if defined?(IssuesController)
    unless IssuesController.included_modules.include?(RedmineYjs::IssuesControllerPatch)
      IssuesController.send(:include, RedmineYjs::IssuesControllerPatch)
      Rails.logger.info "[Yjs] IssuesController patch included"
    end
  end
end

Redmine::Plugin.register :redmine_yjs do
  name 'Redmine Yjs Collaborative Editing'
  author 'Redmine Yjs Plugin'
  description 'Integrates Yjs CRDT-based collaborative editing with Redmine editors using Hocuspocus server'
  version '0.0.3'
  url 'https://github.com/d-led/redmine_yjs'
  author_url 'https://github.com/d-led'
  
  # Requires Redmine 5.0+ (Rails 6.1+, Ruby 3.0+)
  requires_redmine version_or_higher: '5.0.0'

  settings(
    default: {
      # Enable Yjs by default
      'yjs_enabled' => (ENV['YJS_ENABLED'] || '1'),
      # Hocuspocus WebSocket URL (browser connects directly)
      'hocuspocus_url' => ENV['HOCUSPOCUS_URL'] ||
        (File.exist?('/.dockerenv') ? 'ws://localhost:3000/ws' : 'ws://localhost:8081'),
      # Optional shared HMAC secret for signing Hocuspocus auth tokens
      # Can be set via settings UI or YJS_TOKEN_SECRET environment variable.
      # When both are set, the settings value takes precedence.
      'yjs_token_secret' => ENV['YJS_TOKEN_SECRET'] || ''
    },
    partial: 'settings/yjs'
  )
end

# Automatically copy assets to public/plugin_assets on plugin load
# This ensures assets are available without manual copying
ActiveSupport::Reloader.to_prepare do
  RedmineYjs.copy_assets_to_public
end

