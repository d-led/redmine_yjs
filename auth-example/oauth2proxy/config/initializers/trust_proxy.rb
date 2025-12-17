# Trust proxy headers from oauth2-proxy
# This allows Redmine to read X-Forwarded-* and X-Auth-Request-* headers
Rails.application.config.force_ssl = false

# Trust all proxies in Docker network (oauth2-proxy is on the same network)
# In production, you should specify the exact proxy IPs
# Docker networks use private IP ranges, so we trust all private IPs
Rails.application.config.action_dispatch.trusted_proxies = [
  IPAddr.new("10.0.0.0/8"),     # Private network
  IPAddr.new("172.16.0.0/12"),   # Docker network
  IPAddr.new("192.168.0.0/16"),  # Private network
  IPAddr.new("127.0.0.1"),       # Localhost
  IPAddr.new("::1")              # IPv6 localhost
]

# Enable reading of X-Forwarded-* headers
Rails.application.config.action_dispatch.x_forwarded_host = true
Rails.application.config.action_dispatch.x_forwarded_for = true

