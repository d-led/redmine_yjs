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
              url = 'ws://localhost:3000/ws'
            else
              # Default to localhost in both development and production when
              # no explicit URL is configured. Operators are expected to put
              # Hocuspocus behind the same base URL / reverse proxy as Redmine.
              url = 'ws://localhost:3000/ws'
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

    def yjs_websocket_proxy_enabled?
      settings = Setting.plugin_redmine_yjs
      settings && settings['websocket_proxy'] == '1'
    end

    # Generate a Hocuspocus authentication token that is:
    # - user-bound (Redmine user id / login)
    # - document-bound (Yjs document name)
    # - time-bound (short-lived expiry)
    #
    # The token is a compact "<payload>.<signature>" string where:
    # - payload   = base64url(JSON)
    # - signature = base64url(HMAC-SHA256(secret, payload))
    #
    # Secret is provided by YJS_TOKEN_SECRET env var and shared with Hocuspocus.
    def yjs_hocuspocus_token(document_context)
      settings = Setting.plugin_redmine_yjs rescue nil
      # Settings value takes precedence so admins can override without touching env.
      secret = settings && settings['yjs_token_secret'].to_s.strip
      secret = ENV['YJS_TOKEN_SECRET'] if secret.empty?
      return nil if secret.to_s.strip.empty?

      doc = yjs_base_document_name(document_context)
      return nil if doc.nil?

      user = User.current
      return nil unless user&.id

      payload = {
        uid:   user.id,
        login: user.login,
        doc:   doc,
        exp:   Time.now.to_i + 10 * 60 # 10 minutes from now
      }

      payload_json = payload.to_json
      signature = OpenSSL::HMAC.digest('SHA256', secret, payload_json)

      encoded_payload   = Base64.urlsafe_encode64(payload_json, padding: false)
      encoded_signature = Base64.urlsafe_encode64(signature,     padding: false)

      "#{encoded_payload}.#{encoded_signature}"
    rescue StandardError => e
      Rails.logger.error "[Yjs Helper] Failed to generate Hocuspocus token: #{e.class}: #{e.message}"
      nil
    end

    private

    # Derive the canonical base document name from the document context that we
    # also send to the browser. This must stay in sync with generateDocumentName
    # for the main editable resources (issues, wiki pages, project docs).
    def yjs_base_document_name(document_context)
      ctx = document_context || {}

      if ctx[:issue_id] || ctx['issue_id']
        issue_id = ctx[:issue_id] || ctx['issue_id']
        return "issue-#{issue_id}"
      end

      wiki_page_id    = ctx[:wiki_page_id]    || ctx['wiki_page_id']
      wiki_page_title = ctx[:wiki_page_title] || ctx['wiki_page_title']
      project_id      = ctx[:project_id]      || ctx['project_id']

      if wiki_page_id || wiki_page_title
        page_id = wiki_page_id || wiki_page_title
        page_id_safe = page_id.to_s.gsub(/[^a-zA-Z0-9_-]/, '-').downcase
        return "wiki-#{project_id || '0'}-#{page_id_safe}"
      end

      if project_id
        return "project-#{project_id}"
      end

      nil
    end
  end
end


