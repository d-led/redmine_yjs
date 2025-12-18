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
#
# NOTE: This initializer is ONLY for OAuth2 proxy Docker setup, not for the redmine_yjs plugin itself.
# It should only run when copied to Redmine's config/initializers in the Docker image.
# Skip if: test environment, or if this file is being loaded from the plugin directory (not copied to Redmine)
return if Rails.env.test? || __FILE__.include?('plugins/redmine_yjs/auth-example')

Rails.application.config.to_prepare do
  next unless defined?(ApplicationController) && defined?(User)

  ApplicationController.class_eval do
    before_action :auto_login_from_oauth2, prepend: true

    private

    def auto_login_from_oauth2
      # Take the email from the trusted proxy headers first
      email = request.headers['X-Auth-Request-Email'] ||
              request.headers['X-Forwarded-Email']
      user_name = request.headers['X-Auth-Request-User'] ||
                  request.headers['X-Forwarded-User']

      # If no OAuth2 headers, check if user is already logged in (normal session)
      if email.blank?
        if User.current&.logged?
          Rails.logger.debug "[Proxyauth] auto_login_from_oauth2: User already logged in (#{User.current.login}), no OAuth2 headers"
        else
          Rails.logger.debug "[Proxyauth] auto_login_from_oauth2: No email header found on #{request.fullpath}"
        end
        return
      end

      Rails.logger.info "[Proxyauth] auto_login_from_oauth2: Found email header: #{email} on #{request.fullpath}"

      # Find user from OAuth2 email
      user = User.find_by_mail(email)
      
      # If OAuth2 headers are present, we MUST sync with them (source of truth)
      # This prevents redirect loops from stale sessions
      if user&.active?
        # If there's a logged-in user but it's NOT the OAuth2 user, clear the stale session
        if User.current&.logged? && User.current.id != user.id
          Rails.logger.warn "[Proxyauth] auto_login_from_oauth2: Stale session detected! Current user: #{User.current.login} (#{User.current.mail}), OAuth2 user: #{user.login} (#{email}). Clearing stale session."
          # Clear the stale session
          reset_session
          User.current = nil
        end
        
        # If user is already logged in and matches OAuth2, we're good
        if User.current&.logged? && User.current.id == user.id
          Rails.logger.debug "[Proxyauth] auto_login_from_oauth2: User already logged in and matches OAuth2 (#{User.current.login})"
          return
        end
      end
      
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
      # CRITICAL: Set User.current BEFORE setting session, as Redmine's session methods may check it
      User.current = user
      
      # Use Redmine's proper session method if available
      # This method sets both User.current and the session correctly
      if respond_to?(:start_user_session, true)
        send(:start_user_session, user)
        Rails.logger.info "[Proxyauth] auto_login_from_oauth2: Used start_user_session for #{user.login}"
      else
        # Fallback: set the standard session keys manually.
        session[:user_id] = user.id
        # Ensure User.current is set (don't reload from session as it might not be persisted yet)
        User.current = user
        Rails.logger.info "[Proxyauth] auto_login_from_oauth2: Set session manually for #{user.login}"
      end

      # Verify the login worked
      # Don't reload User.current from session here - we just set it above
      if User.current&.logged?
        Rails.logger.info "[Proxyauth] auto_login_from_oauth2: ✅ Successfully auto-logged in #{user.login} on #{request.fullpath}"
      else
        Rails.logger.warn "[Proxyauth] auto_login_from_oauth2: ⚠️ User.current.logged? is false after setting session. User.current: #{User.current&.id}, session[:user_id]: #{session[:user_id]}"
      end
    rescue => e
      Rails.logger.error "[Proxyauth] auto_login_from_oauth2 error: #{e.class}: #{e.message}"
      Rails.logger.error "[Proxyauth] Backtrace: #{e.backtrace.first(10).join(', ')}" if e.backtrace
    end
  end
end





