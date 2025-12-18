#! /usr/bin/env ruby
# Configure session cookie to use root path (/) so all paths share the same session.
# This prevents redirect loops caused by different paths having different session cookies.
Rails.application.config.to_prepare do
  # Set session cookie path to root so all paths share the same session
  # This must be done after Redmine's session configuration is loaded
  # Use session_options which is the standard way to configure session cookies in Rails
  Rails.application.config.session_options[:path] = '/'
  
  # Also ensure the session store respects this setting
  # This is a safe way to configure session cookies without interfering with Redmine's session management
  if defined?(ActionDispatch::Session::CookieStore)
    # The cookie path is set via session_options, which CookieStore will use
    Rails.logger.info "[Session Config] Session cookie path set to '/' to prevent redirect loops"
  end
end

