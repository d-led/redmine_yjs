module RedmineYjs
  module ApplicationHelperPatch
    def self.included(base)
      # Methods are automatically available in views when included in ApplicationHelper
      base.class_eval do
        # Ensure methods are available
      end
    end

    def hocuspocus_url
      @hocuspocus_url ||= begin
        # Check plugin settings first
        url = Setting.plugin_redmine_yjs['hocuspocus_url'] if Setting.plugin_redmine_yjs
        
        # Auto-detect if not set
        if url.blank?
          # Check environment variable
          url = ENV['HOCUSPOCUS_URL']
          
          # Auto-detect based on environment
          if url.blank?
            # In Docker with Traefik, WebSocket is proxied at /ws path
            if ENV['DOCKER_ENV'] || File.exist?('/.dockerenv')
              # Use same hostname as the page, with /ws path for WebSocket
              url = ENV['HOCUSPOCUS_URL'] || 'ws://localhost:3000/ws'
            # In production/Fly.io, try to detect
            elsif Rails.env.production?
              # Try to get from Fly.io internal networking
              url = ENV['HOCUSPOCUS_URL'] || 'wss://hocuspocus.fly.dev'
            # Development
            else
              url = ENV['HOCUSPOCUS_URL'] || 'ws://localhost:3000/ws'
            end
          end
        end
        
        # Ensure URL uses browser-accessible hostname (not Docker internal hostname)
        # With Traefik, WebSocket is accessible at /ws path on the same hostname as Redmine
        if url.present? && url.include?('hocuspocus:')
          # Replace Docker internal hostname with localhost for browser access
          url = url.gsub('hocuspocus:', 'localhost:')
        end
        
        # Remove trailing slash (WebSocket URLs shouldn't have trailing slashes)
        url = url.gsub(/\/+$/, '') if url.present?
        
        url
      end
    end

    def yjs_enabled?
      settings = Setting.plugin_redmine_yjs
      return false unless settings
      
      enabled = settings['yjs_enabled'] == '1'
      Rails.logger.debug "[Yjs Helper] yjs_enabled? called: settings=#{settings.inspect}, enabled=#{enabled}"
      enabled
    end

    def yjs_document_name(project_id, document_type, document_id)
      # Generate a unique document name for Yjs sync
      # Format: project-{id}-{type}-{id}
      "project-#{project_id}-#{document_type}-#{document_id}"
    end
  end
end

