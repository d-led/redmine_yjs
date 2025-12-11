# frozen_string_literal: true

# ActionCable channel that proxies Yjs WebSocket connections to Hocuspocus
# This allows WebSocket traffic to flow through Redmine's Puma server,
# avoiding CORS issues and centralizing authentication.
#
# Enable in plugin settings: "Proxy WebSocket through Redmine"
#
class YjsChannel < ApplicationCable::Channel
  BUFFER_SIZE = 64 * 1024 # 64KB buffer for binary messages

  def subscribed
    @document = params[:document]
    
    unless yjs_proxy_enabled?
      reject
      Rails.logger.warn "[Yjs] WebSocket proxy not enabled, rejecting connection"
      return
    end

    hocuspocus_url = internal_hocuspocus_url
    unless hocuspocus_url
      reject
      Rails.logger.error "[Yjs] Hocuspocus internal URL not configured"
      return
    end

    # Build WebSocket URL with document name
    ws_url = "#{hocuspocus_url}/#{@document}"
    
    Rails.logger.info "[Yjs] Proxying WebSocket for document '#{@document}' to #{ws_url}"
    Rails.logger.info "[Yjs] User: #{current_user&.login || 'anonymous'}"

    begin
      connect_to_hocuspocus(ws_url)
      stream_from "yjs:#{@document}"
    rescue StandardError => e
      Rails.logger.error "[Yjs] Failed to connect to Hocuspocus: #{e.message}"
      reject
    end
  end

  def unsubscribed
    disconnect_from_hocuspocus
    Rails.logger.info "[Yjs] Disconnected from document '#{@document}'"
  end

  # Receive binary Yjs updates from client, forward to Hocuspocus
  def receive(data)
    return unless @hocuspocus_ws&.open?

    if data.is_a?(Hash) && data['binary']
      # Binary data encoded as base64
      binary = Base64.decode64(data['binary'])
      @hocuspocus_ws.send(binary)
    elsif data.is_a?(String)
      @hocuspocus_ws.send(data)
    end
  rescue StandardError => e
    Rails.logger.error "[Yjs] Error forwarding to Hocuspocus: #{e.message}"
  end

  private

  def yjs_proxy_enabled?
    settings = Setting.plugin_redmine_yjs
    settings && settings['websocket_proxy'] == '1'
  end

  def internal_hocuspocus_url
    settings = Setting.plugin_redmine_yjs
    return nil unless settings
    
    url = settings['hocuspocus_internal_url']
    return nil if url.blank?
    
    # Ensure ws:// or wss:// protocol
    url = "ws://#{url}" unless url.start_with?('ws://', 'wss://')
    url.chomp('/')
  end

  def connect_to_hocuspocus(url)
    require 'websocket-client-simple'

    # Build auth token with user info
    token = {
      id: current_user&.id || 0,
      name: current_user&.name || 'Anonymous',
      login: current_user&.login || 'anonymous'
    }.to_json

    @hocuspocus_ws = WebSocket::Client::Simple.connect(url, headers: {
      'Authorization' => "Bearer #{token}"
    })

    channel = self

    @hocuspocus_ws.on :message do |msg|
      # Forward messages from Hocuspocus to client
      if msg.type == :binary
        channel.transmit(binary: Base64.strict_encode64(msg.data))
      else
        channel.transmit(text: msg.data)
      end
    end

    @hocuspocus_ws.on :error do |e|
      Rails.logger.error "[Yjs] Hocuspocus WebSocket error: #{e.message}"
    end

    @hocuspocus_ws.on :close do |e|
      Rails.logger.info "[Yjs] Hocuspocus connection closed: #{e&.code}"
    end
  end

  def disconnect_from_hocuspocus
    @hocuspocus_ws&.close
  rescue StandardError => e
    Rails.logger.warn "[Yjs] Error closing Hocuspocus connection: #{e.message}"
  ensure
    @hocuspocus_ws = nil
  end
end

