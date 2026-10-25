require 'redmine'

base_path = File.dirname(__FILE__)
if Rails.configuration.respond_to?(:autoloader) && Rails.configuration.autoloader == :zeitwerk
  Rails.autoloaders.each { |loader| loader.ignore("#{base_path}/lib") }
end

require "#{base_path}/lib/redmine_yjs"
require "#{base_path}/lib/redmine_yjs/document_name"
require "#{base_path}/lib/redmine_yjs/token"
require "#{base_path}/lib/redmine_yjs/application_helper_patch"
require "#{base_path}/lib/redmine_yjs/hooks"
require "#{base_path}/lib/redmine_yjs/wiki_controller_patch"
require "#{base_path}/lib/redmine_yjs/issues_controller_patch"

# Redmine evaluates this file inside a to_prepare callback, so patches must be
# applied right now; the Reloader hook only matters when development reloads.
RedmineYjs.apply_patches
ActiveSupport::Reloader.to_prepare { RedmineYjs.apply_patches }

Redmine::Plugin.register :redmine_yjs do
  name 'Redmine Yjs Collaborative Editing'
  author 'Redmine Yjs Plugin'
  description 'Integrates Yjs CRDT-based collaborative editing with Redmine editors using Hocuspocus server'
  version '0.0.5'
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
RedmineYjs.copy_assets_to_public
ActiveSupport::Reloader.to_prepare { RedmineYjs.copy_assets_to_public }

