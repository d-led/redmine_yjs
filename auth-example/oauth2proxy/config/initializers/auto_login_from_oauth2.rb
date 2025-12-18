#! /usr/bin/env ruby
# Lightweight auto-login from oauth2-proxy headers.
# 
# Goal:
# - Do NOT change redmine_proxyauth behaviour for /login (it still owns
#   user provisioning and admin promotion).
# - On every request that already has trusted OAuth2 headers, ensure
#   User.current and the Rails session are in sync, so that Redmine's
#   own before_actions (like :session_expiration / :require_login) see
#   the user as logged in and do not trigger redirect loops.
#
# This is intentionally simple and narrow:
# - We only ever look up an existing User by email.
# - We do NOT create users here; redmine_proxyauth does that on /login.
# - We run before other filters (prepend: true) so that session_expiration
#   sees a logged-in user when oauth2-proxy says the request is authenticated.

Rails.application.config.to_prepare do
  next unless defined?(ApplicationController) && defined?(User)

  ApplicationController.class_eval do
    before_action :auto_login_from_oauth2, prepend: true

    private

    def auto_login_from_oauth2
      # If Redmine already considers the user logged in, do nothing.
      if User.current&.logged?
        Rails.logger.debug "[Proxyauth] auto_login_from_oauth2: User already logged in (#{User.current.login})"
        return
      end

      # Take the email from the trusted proxy headers.
      email = request.headers['X-Auth-Request-Email'] ||
              request.headers['X-Forwarded-Email']
      user_name = request.headers['X-Auth-Request-User'] ||
                  request.headers['X-Forwarded-User']

      if email.blank?
        Rails.logger.debug "[Proxyauth] auto_login_from_oauth2: No email header found on #{request.fullpath}"
        return
      end

      Rails.logger.info "[Proxyauth] auto_login_from_oauth2: Found email header: #{email} on #{request.fullpath}"

      user = User.find_by_mail(email)
      
      # If user doesn't exist, let redmine_proxyauth handle creation on /login
      # But if user exists, auto-login them even on /login route
      if user.nil?
        Rails.logger.debug "[Proxyauth] auto_login_from_oauth2: User with email #{email} not found"
        # Only skip if we're on /login (let proxyauth create the user)
        # On other routes, we can't auto-login a non-existent user
        if request.path == '/login' || request.path.start_with?('/login?')
          Rails.logger.debug "[Proxyauth] auto_login_from_oauth2: Letting redmine_proxyauth handle user creation on /login"
          return
        else
          Rails.logger.warn "[Proxyauth] auto_login_from_oauth2: User not found and not on /login, cannot auto-login"
          return
        end
      end
      
      # User exists - auto-login them even on /login route
      # This provides seamless experience: if user already exists, they're logged in immediately

      # Do not auto-login inactive users
      unless user&.active?
        Rails.logger.warn "[Proxyauth] auto_login_from_oauth2: User #{email} is not active"
        return
      end

      # Optionally keep name in sync with headers (non-empty values only).
      if user_name.present?
        first, last = user_name.split(' ', 2)
        changed = false
        if first.present? && user.firstname != first
          user.firstname = first
          changed = true
        end
        if last.present? && last != '' && user.lastname != last
          user.lastname = last
          changed = true
        end
        user.save(validate: false) if changed
      end

      # Align Redmine's current user and session with the proxy identity.
      User.current = user
      
      # Use Redmine's proper session method if available
      if respond_to?(:start_user_session, true)
        send(:start_user_session, user)
        Rails.logger.info "[Proxyauth] auto_login_from_oauth2: Used start_user_session for #{user.login}"
      else
        # Fallback: set the standard session keys manually.
        session[:user_id] = user.id
        # Redmine also uses :user_id in session, ensure it's set
        session[:updated_at] = Time.now.to_i
        Rails.logger.info "[Proxyauth] auto_login_from_oauth2: Set session manually for #{user.login}"
      end

      # Force session to be saved immediately to avoid redirect loops
      # This ensures the session cookie is set before any redirects happen
      if session.respond_to?(:save!)
        session.save!
      end

      # Verify the login worked
      if User.current&.logged?
        Rails.logger.info "[Proxyauth] auto_login_from_oauth2: ✅ Successfully auto-logged in #{user.login} on #{request.fullpath}"
      else
        Rails.logger.warn "[Proxyauth] auto_login_from_oauth2: ⚠️ Session set but User.current.logged? is false for #{user.login}"
      end
    rescue => e
      Rails.logger.error "[Proxyauth] auto_login_from_oauth2 error: #{e.class}: #{e.message}"
      Rails.logger.error "[Proxyauth] Backtrace: #{e.backtrace.first(10).join(', ')}" if e.backtrace
    end
  end
end





