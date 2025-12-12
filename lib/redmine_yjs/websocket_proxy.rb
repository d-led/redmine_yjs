# frozen_string_literal: true

# Rack middleware that proxies WebSocket connections from /ws/* to Hocuspocus
# This allows browsers to connect to Redmine's WebSocket endpoint, which then
# proxies to Hocuspocus internally, avoiding CORS issues.
#
# Usage: Mount this middleware in init.rb when websocket_proxy is enabled

module RedmineYjs
  class WebsocketProxy
    def initialize(app)
      @app = app
    end

    def call(env)
      # Only handle /ws/* paths
      return @app.call(env) unless env['PATH_INFO'].start_with?('/ws')

      # Check if this is a WebSocket upgrade request
      return @app.call(env) unless websocket_request?(env)

      # Get Hocuspocus internal URL from settings
      settings = Setting.plugin_redmine_yjs
      return @app.call(env) unless settings && settings['websocket_proxy'] == '1'

      internal_url = settings['hocuspocus_internal_url']
      return @app.call(env) if internal_url.blank?

      # Ensure ws:// protocol
      internal_url = "ws://#{internal_url}" unless internal_url.start_with?('ws://', 'wss://')
      internal_url = internal_url.chomp('/')

      # Extract document name from path (e.g., /ws/document-name -> document-name)
      document_name = env['PATH_INFO'].sub(%r{^/ws/?}, '')

      # Build full Hocuspocus URL
      hocuspocus_url = "#{internal_url}/#{document_name}"

      Rails.logger.info "[Yjs] Proxying WebSocket #{env['PATH_INFO']} to #{hocuspocus_url}"
      Rails.logger.info "[Yjs] User: #{User.current&.login || 'anonymous'}"

      # Proxy the WebSocket connection
      proxy_websocket(env, hocuspocus_url)
    end

    private

    def websocket_request?(env)
      env['HTTP_UPGRADE']&.downcase == 'websocket' &&
        env['HTTP_CONNECTION']&.downcase&.include?('upgrade')
    end

    def proxy_websocket(env, backend_url)
      require 'faye/websocket'
      require 'uri'

      # Parse backend URL
      uri = URI.parse(backend_url)
      backend_host = uri.host
      backend_port = uri.port || (uri.scheme == 'wss' ? 443 : 80)
      backend_path = uri.path

      # Create WebSocket connection to backend
      ws = Faye::WebSocket::Client.new(
        backend_url,
        nil,
        headers: build_backend_headers(env, uri)
      )

      # Create WebSocket response for client
      response = nil
      ws.on :open do |_event|
        Rails.logger.info "[Yjs] WebSocket proxy connected to #{backend_url}"
      end

      ws.on :message do |event|
        # Forward message from backend to client
        if response && response.respond_to?(:write)
          response.write(event.data)
        end
      end

      ws.on :error do |event|
        Rails.logger.error "[Yjs] WebSocket proxy error: #{event.message}"
      end

      ws.on :close do |event|
        Rails.logger.info "[Yjs] WebSocket proxy closed: #{event.code}"
      end

      # Upgrade the request to WebSocket
      if Faye::WebSocket.websocket?(env)
        ws = Faye::WebSocket.new(env)

        ws.on :message do |event|
          # Forward message from client to backend
          backend_ws.send(event.data) if backend_ws
        end

        ws.on :close do |event|
          backend_ws&.close
        end

        ws.rack_response
      else
        # Not a WebSocket request, pass through
        @app.call(env)
      end
    rescue LoadError => e
      Rails.logger.error "[Yjs] faye-websocket gem not available: #{e.message}"
      Rails.logger.error "[Yjs] Install with: gem install faye-websocket"
      @app.call(env)
    rescue StandardError => e
      Rails.logger.error "[Yjs] WebSocket proxy error: #{e.message}"
      Rails.logger.error e.backtrace.join("\n")
      @app.call(env)
    end

    def build_backend_headers(env, uri)
      headers = {}

      # Forward user authentication if available
      if User.current&.logged?
        token = {
          id: User.current.id,
          name: User.current.name,
          login: User.current.login
        }.to_json
        headers['Authorization'] = "Bearer #{token}"
      end

      # Forward relevant headers
      %w[User-Agent Origin Referer].each do |header|
        headers[header] = env["HTTP_#{header.upcase.tr('-', '_')}"] if env["HTTP_#{header.upcase.tr('-', '_')}"]
      end

      headers
    end
  end
end

