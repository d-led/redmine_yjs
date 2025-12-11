# frozen_string_literal: true

# Only define ApplicationCable module if ActionCable is available
# This allows the plugin to work without ActionCable (e.g., direct WebSocket mode)
if defined?(ActionCable::Connection::Base)
  module ApplicationCable
    class Connection < ActionCable::Connection::Base
      identified_by :current_user

      def connect
        self.current_user = find_verified_user
      end

      private

      def find_verified_user
        # Try to find user from Redmine session
        if (user_id = cookies.signed[:user_id]) || (user_id = session_user_id)
          User.find_by(id: user_id)
        else
          # Allow anonymous connections for public projects
          User.anonymous
        end
      end

      def session_user_id
        # Redmine stores session in cookies, try to extract user_id
        if cookies[:_redmine_session]
          begin
            session_data = Rails.application.message_verifier('session').verify(cookies[:_redmine_session])
            session_data['user_id']
          rescue StandardError
            nil
          end
        end
      end
    end

    class Channel < ActionCable::Channel::Base
    end
  end
end

